#!/usr/bin/env python3
"""East Agency Weekly Instagram Post Generator — runs weekly via GitHub Actions.

Separate content rotation from the blog (see generate-social-post.py, which
handles Facebook by repurposing blog posts). Instagram gets its own
Instagram-native topics plus 4 date-triggered seasonal posts, with an
original image generated per post via Gemini (Nano Banana) rather than
reusing blog category stock photos.

Runs in two phases because the generated image needs to be live on the site
(a public HTTPS URL) before Instagram's API will accept it:
  1. `generate` -- pick topic, write caption + image, save image into
     assets/instagram/, write scripts/.ig_pending.json. Workflow then commits
     + pushes the image and waits for it to go live.
  2. `publish`  -- read .ig_pending.json, publish to Instagram, record
     history, clean up the pending file.
"""

import os, re, json, sys, base64, calendar
from datetime import date, timedelta
import anthropic
import requests

SITE = "https://brannoneast.agency"
GRAPH_API = "https://graph.facebook.com/v21.0"
PENDING_PATH = "scripts/.ig_pending.json"
TOPIC_HISTORY_PATH = "scripts/instagram_topic_history.json"
SEASONAL_HISTORY_PATH = "scripts/instagram_seasonal_history.json"
IMAGE_DIR = "assets/instagram"

# 26 topics -- heavier on life insurance (8) per Brannon's explicit request,
# the rest split across quick tips/home maintenance, insurance definitions
# (glossary-style, matching knowledge.html), myth-busting, local
# Cartersville/Bartow content, and healthy recipes/desserts.
IG_TOPICS = [
    {"type": "life", "cat": "Life Insurance", "topic": "Term life insurance: what it actually covers and who it's right for"},
    {"type": "life", "cat": "Life Insurance", "topic": "IUL (Indexed Universal Life) explained honestly -- the pros and the cons"},
    {"type": "life", "cat": "Life Insurance", "topic": "Mortgage protection insurance: do you need a separate policy from your regular life insurance?"},
    {"type": "life", "cat": "Life Insurance", "topic": "Final expense insurance: covering funeral and end-of-life costs without burdening your family"},
    {"type": "life", "cat": "Life Insurance", "topic": "How much life insurance coverage do you actually need?"},
    {"type": "life", "cat": "Life Insurance", "topic": "The #1 reason people put off buying life insurance -- and why it costs them"},
    {"type": "life", "cat": "Life Insurance", "topic": "What changes about your life insurance once you have kids"},
    {"type": "life", "cat": "Life Insurance", "topic": "When you should actually review or update your life insurance policy"},

    {"type": "tip", "cat": "Quick Tip", "topic": "3 home maintenance tasks that help prevent expensive insurance claims"},
    {"type": "tip", "cat": "Quick Tip", "topic": "What to actually do in the first 10 minutes after a car accident"},
    {"type": "tip", "cat": "Quick Tip", "topic": "How often you should really review your insurance policy"},
    {"type": "tip", "cat": "Quick Tip", "topic": "Simple, real ways to lower your home insurance premium"},

    {"type": "definition", "cat": "Know Your Terms", "topic": "What a deductible actually is, explained simply"},
    {"type": "definition", "cat": "Know Your Terms", "topic": "Liability vs. full coverage: what's the real difference"},
    {"type": "definition", "cat": "Know Your Terms", "topic": "What \"actual cash value\" means when you file a claim"},
    {"type": "definition", "cat": "Know Your Terms", "topic": "What an umbrella policy covers that your regular policy doesn't"},

    {"type": "myth", "cat": "Myth Busting", "topic": "Myth: using an independent agent costs more than buying direct"},
    {"type": "myth", "cat": "Myth Busting", "topic": "Myth: red cars cost more to insure"},
    {"type": "myth", "cat": "Myth Busting", "topic": "Myth: your homeowners policy automatically covers flood damage"},

    {"type": "local", "cat": "Local", "topic": "Why Cartersville families choose a local agent over a call center"},
    {"type": "local", "cat": "Local", "topic": "Storm season in Bartow County: what your policy should already cover"},
    {"type": "local", "cat": "Local", "topic": "A look inside The East Agency's office in Cartersville, GA"},

    {"type": "recipe", "cat": "Recipe", "topic": "A healthy weeknight dinner recipe a busy family will actually eat"},
    {"type": "recipe", "cat": "Recipe", "topic": "A fun, easy dessert recipe worth making this weekend"},
    {"type": "recipe", "cat": "Recipe", "topic": "A healthy lunch recipe you can meal-prep for the week"},
    {"type": "recipe", "cat": "Recipe", "topic": "A cozy comfort-food recipe with a healthier twist"},
]

# 4 seasonal posts, checked against a Monday-Sunday window so each fires on
# exactly the one weekly run whose week contains the actual date, regardless
# of which day of the week the date itself falls on.
IG_SEASONAL = [
    {"name": "veterans_day", "month": 11, "day": 11, "floating": None,
     "cat": "Veterans Day",
     "topic": "A Veterans Day post honoring the veterans in our Cartersville/Bartow community and thanking them for their service"},
    {"name": "thanksgiving", "month": 11, "day": None, "floating": "thanksgiving_us",
     "cat": "Thanksgiving",
     "topic": "A warm Thanksgiving post about gratitude for our clients and community, with a gentle nudge to review coverage before year-end"},
    {"name": "christmas", "month": 12, "day": 25, "floating": None,
     "cat": "Christmas",
     "topic": "A warm Christmas/holiday greeting from Brannon and The East Agency to the Cartersville community"},
    {"name": "new_years", "month": 1, "day": 1, "floating": None,
     "cat": "New Year",
     "topic": "A New Year, New Policy Review post -- a fresh-start reminder to check that your coverage still fits your life"},
]


def _load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _nth_weekday_of_month(year, month, weekday, n):
    """weekday: Monday=0 ... Sunday=6. n: 1st/2nd/3rd/4th occurrence in the month."""
    c = calendar.Calendar()
    days = [d for d in c.itermonthdates(year, month) if d.month == month and d.weekday() == weekday]
    return days[n - 1]


def _seasonal_target_date(entry, year):
    if entry["floating"] == "thanksgiving_us":
        return _nth_weekday_of_month(year, 11, 3, 4)  # 4th Thursday of November
    return date(year, entry["month"], entry["day"])


def pick_seasonal(today):
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    history = _load_json(SEASONAL_HISTORY_PATH, [])

    for entry in IG_SEASONAL:
        # Check the target date under both the Monday's year and the Sunday's
        # year -- a week spanning Dec 31/Jan 1 has a Monday in one calendar
        # year and a Sunday in the next, so New Year's Day only matches if we
        # check both (missed this initially: the week of 2026-12-28 contains
        # 2027-01-01, but today.year alone only resolves to 2026-01-01).
        for candidate_year in {monday.year, sunday.year}:
            target = _seasonal_target_date(entry, candidate_year)
            if not (monday <= target <= sunday):
                continue
            already = any(h["name"] == entry["name"] and h["year"] == candidate_year for h in history)
            if already:
                continue
            return entry, candidate_year
    return None, None
    return None


def record_seasonal_used(name, year):
    history = _load_json(SEASONAL_HISTORY_PATH, [])
    history.append({"name": name, "year": year})
    _save_json(SEASONAL_HISTORY_PATH, history)


def pick_topic(today):
    history = _load_json(TOPIC_HISTORY_PATH, [])
    used = {h["topic"] for h in history}

    iso = today.isocalendar()
    start_index = ((iso[0] - 2026) * 52 + iso[1]) % len(IG_TOPICS)

    for offset in range(len(IG_TOPICS)):
        candidate = IG_TOPICS[(start_index + offset) % len(IG_TOPICS)]
        if candidate["topic"] not in used:
            return candidate

    print("Full Instagram topic rotation complete -- starting a new cycle.")
    _save_json(TOPIC_HISTORY_PATH, [])
    return IG_TOPICS[start_index]


def record_topic_used(topic, date_iso):
    history = _load_json(TOPIC_HISTORY_PATH, [])
    history.append({"topic": topic, "date": date_iso})
    _save_json(TOPIC_HISTORY_PATH, history)


def generate_caption_and_prompt(entry):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = (
        f'You are writing an Instagram post for The East Agency, an independent insurance agency '
        f'in Cartersville, GA run by Brannon East. This account mixes insurance education with warm, '
        f'local, lifestyle content -- not just sales posts.\n\n'
        f'Post category: {entry["cat"]}\n'
        f'Topic: {entry["topic"]}\n\n'
        f'Write two things:\n\n'
        f'1. CAPTION: 80-130 words, conversational, hook in the first line, short punchy lines. '
        f'Mention Cartersville/Bartow County naturally if it fits the topic (skip it for recipe posts, '
        f'that would feel forced). If the topic is insurance-related, end with a light call to action '
        f'(read more, ask a question, get a quote) -- but if it\'s a recipe or purely local/community post, '
        f'do NOT force an insurance sales pitch, just let it be genuinely useful/warm content. '
        f'Add 3-5 relevant hashtags on their own line at the end. No em dashes, no corporate filler phrases.\n\n'
        f'2. IMAGE_PROMPT: a detailed prompt for an AI photo generator to create ONE photorealistic, '
        f'warm, on-brand image for this specific post (square, Instagram feed). Describe subject, setting, '
        f'lighting, and style concretely. Do NOT ask for any text, words, signage, or logos to be rendered '
        f'in the image -- AI image models render text unreliably, so the image should be a clean scene with '
        f'no readable text at all.\n\n'
        f'Return ONLY a raw JSON object, no markdown fences, no commentary:\n'
        f'{{"caption": "...", "image_prompt": "..."}}'
    )
    for attempt in range(3):
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text.strip()
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw.strip())
            parsed = json.loads(raw)
            return parsed["caption"], parsed["image_prompt"]
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Caption generation attempt {attempt + 1} failed ({type(e).__name__}): {e}")
            if attempt == 2:
                raise


def generate_image(image_prompt, out_path):
    key = os.environ["GEMINI_API_KEY"]
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={key}",
        json={"contents": [{"parts": [{"text": image_prompt}]}]},
        timeout=60,
    )
    result = resp.json()
    if "error" in result:
        raise RuntimeError(f"Nano Banana generation failed: {result['error']}")

    for part in result["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(base64.b64decode(part["inlineData"]["data"]))
            return
    raise RuntimeError("Nano Banana response had no image data")


def cmd_generate():
    today = date.today()
    seasonal, seasonal_year = pick_seasonal(today)
    is_seasonal = seasonal is not None
    entry = seasonal if is_seasonal else pick_topic(today)

    print(f"{'Seasonal' if is_seasonal else 'Regular'} topic: {entry['topic']}")

    caption, image_prompt = generate_caption_and_prompt(entry)
    print("--- Caption ---")
    print(caption)
    print("--- Image prompt ---")
    print(image_prompt)

    slug = re.sub(r'[^a-z0-9]+', '-', entry["topic"].lower()).strip('-')[:60]
    filename = f"{today.isoformat()}-{slug}.png"
    local_path = f"{IMAGE_DIR}/{filename}"
    generate_image(image_prompt, local_path)
    print(f"Image saved: {local_path}")

    _save_json(PENDING_PATH, {
        "topic": entry["topic"],
        "is_seasonal": is_seasonal,
        "seasonal_name": entry.get("name") if is_seasonal else None,
        "caption": caption,
        "image_url": f"{SITE}/{IMAGE_DIR}/{filename}",
        "date_iso": today.isoformat(),
        "year": seasonal_year if is_seasonal else today.year,
    })
    print(f"Pending state written to {PENDING_PATH}")


def cmd_publish():
    pending = _load_json(PENDING_PATH, None)
    if pending is None:
        raise RuntimeError(f"No {PENDING_PATH} found -- run 'generate' first")

    ig_id = os.environ["IG_BUSINESS_ACCOUNT_ID"]
    token = os.environ["FB_PAGE_ACCESS_TOKEN"]

    create = requests.post(
        f"{GRAPH_API}/{ig_id}/media",
        data={"image_url": pending["image_url"], "caption": pending["caption"], "access_token": token},
        timeout=30,
    )
    create_result = create.json()
    if "error" in create_result:
        raise RuntimeError(f"Instagram media creation FAILED: {create_result['error']}")

    publish = requests.post(
        f"{GRAPH_API}/{ig_id}/media_publish",
        data={"creation_id": create_result["id"], "access_token": token},
        timeout=30,
    )
    publish_result = publish.json()
    if "error" in publish_result:
        raise RuntimeError(f"Instagram publish FAILED: {publish_result['error']}")

    print(f"Instagram post OK: media_id={publish_result.get('id')}")

    if pending["is_seasonal"]:
        record_seasonal_used(pending["seasonal_name"], pending["year"])
    else:
        record_topic_used(pending["topic"], pending["date_iso"])

    os.remove(PENDING_PATH)
    print("History recorded, pending file cleaned up.")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "generate":
        cmd_generate()
    elif mode == "publish":
        cmd_publish()
    else:
        print("Usage: generate-instagram-post.py [generate|publish]")
        sys.exit(1)
