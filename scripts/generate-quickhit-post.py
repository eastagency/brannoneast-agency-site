#!/usr/bin/env python3
"""East Agency Quick-Hit Campaign Post — manually dispatched, one topic at a
time, posts the SAME content to both Facebook and Instagram. Built for the
September 2026 Life Insurance Awareness Month campaign's Wed/Fri posts that
don't have a matching new blog post to repurpose (see generate-facebook-post.py
for the normal blog-repurposing flow, and generate-instagram-post.py for the
standing weekly rotation).

Two phases, same reason as generate-instagram-post.py: Instagram's API needs
the generated image to already be live at a public HTTPS URL before it will
accept it.
  1. `generate` -- write caption + image, save into assets/instagram/,
     write scripts/.quickhit_pending.json. Workflow then commits + pushes
     the image and waits for it to go live.
  2. `publish`  -- read .quickhit_pending.json, post to Facebook AND
     Instagram, record history, clean up the pending file.

Inputs come from env vars (set by the workflow_dispatch inputs):
  TOPIC     -- required. What the post is about, e.g. "Term life insurance:
               what it actually covers and who it's right for"
  CAT       -- optional label for logging, e.g. "Life Insurance"
  LINK_PATH -- optional, defaults to /life-insurance-quote.html. The site path
               the CTA should point to.
"""

import os, re, json, sys, base64
from datetime import date
import anthropic
import requests

SITE = "https://brannoneast.agency"
GRAPH_API = "https://graph.facebook.com/v21.0"
PENDING_PATH = "scripts/.quickhit_pending.json"
HISTORY_PATH = "scripts/quickhit_history.json"
IMAGE_DIR = "assets/instagram"
PHONE = "(678) 562-6905"

CTA_EXAMPLES = (
    "- Low-friction: \"Takes about 2 minutes -- get your free quote: {{LINK}}\"\n"
    "- Personal/real person: \"Skip the hold music, text me directly: {{PHONE}}\"\n"
    "- Curiosity: \"Not sure which option actually fits your situation? Let's figure it out: {{LINK}}\"\n"
    "- No-pressure: \"See what it actually costs, no sales pitch: {{LINK}}\"\n"
    "- Relationship: \"Questions? That's literally what I'm here for. Call or text: {{PHONE}}\"\n"
    "- Value/protection: \"Protect the people who depend on you. Start here: {{LINK}}\"\n"
    "- Direct but warm: \"Ready when you are. Grab a quote: {{LINK}} (or just call, I actually answer)\""
)


def _load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def generate_caption_and_prompt(topic, cat, link):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = (
        f'You are writing a social post (used identically on Facebook and Instagram) for The East '
        f'Agency, an independent insurance agency in Cartersville, GA run by Brannon East, as part of '
        f'a September Life Insurance Awareness Month campaign.\n\n'
        f'Category: {cat}\n'
        f'Topic: {topic}\n\n'
        f'Write two things:\n\n'
        f'1. CAPTION: 80-130 words, conversational, hook in the first line, short punchy lines. '
        f'Mention Cartersville/Bartow County naturally if it fits. '
        f'End with a real, specific call to action -- not a generic "get a quote today" line. '
        f'Write it in whatever style genuinely fits this topic/tone (a few examples of the range, write your own '
        f'in a similar spirit, don\'t just pick one verbatim):\n'
        f'{CTA_EXAMPLES}\n'
        f'Your closing CTA sentence MUST include the literal tokens {{{{LINK}}}} and {{{{PHONE}}}} exactly '
        f'(they get replaced with the real URL and phone number afterward) -- do not write out an actual URL or '
        f'number yourself. Add 3-5 relevant hashtags on their own line at the end (include #LifeInsuranceAwarenessMonth). '
        f'No em dashes, no corporate filler phrases.\n\n'
        f'2. IMAGE_PROMPT: a detailed prompt for an AI photo generator to create ONE photorealistic, warm, '
        f'on-brand image for this specific post (square, feed format). Describe subject, setting, lighting, and '
        f'style concretely. Do NOT ask for any text, words, signage, or logos to be rendered in the image.\n\n'
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
            caption = parsed["caption"].replace("{{LINK}}", f"{SITE}{link}").replace("{{PHONE}}", PHONE)
            return caption, parsed["image_prompt"]
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
    topic = os.environ["TOPIC"].strip()
    cat = os.environ.get("CAT", "Life Insurance").strip()
    link = os.environ.get("LINK_PATH", "/life-insurance-quote.html").strip()
    if not topic:
        raise RuntimeError("TOPIC env var is required")

    print(f"Quick-hit topic: {topic}")
    caption, image_prompt = generate_caption_and_prompt(topic, cat, link)
    print("--- Caption ---")
    print(caption)
    print("--- Image prompt ---")
    print(image_prompt)

    today = date.today()
    slug = re.sub(r'[^a-z0-9]+', '-', topic.lower()).strip('-')[:60]
    filename = f"quickhit-{today.isoformat()}-{slug}.png"
    local_path = f"{IMAGE_DIR}/{filename}"
    generate_image(image_prompt, local_path)
    print(f"Image saved: {local_path}")

    _save_json(PENDING_PATH, {
        "topic": topic,
        "caption": caption,
        "image_url": f"{SITE}/{IMAGE_DIR}/{filename}",
        "date_iso": today.isoformat(),
    })
    print(f"Pending state written to {PENDING_PATH}")


def post_to_facebook(image_url, caption):
    page_id = os.environ["FB_PAGE_ID"]
    token = os.environ["FB_PAGE_ACCESS_TOKEN"]
    resp = requests.post(
        f"{GRAPH_API}/{page_id}/photos",
        data={"url": image_url, "caption": caption, "access_token": token},
        timeout=30,
    )
    result = resp.json()
    if "error" in result:
        print(f"Facebook post FAILED: {result['error']}")
        return False
    print(f"Facebook post OK: post_id={result.get('post_id') or result.get('id')}")
    return True


def post_to_instagram(image_url, caption):
    ig_id = os.environ["IG_BUSINESS_ACCOUNT_ID"]
    token = os.environ["FB_PAGE_ACCESS_TOKEN"]

    create = requests.post(
        f"{GRAPH_API}/{ig_id}/media",
        data={"image_url": image_url, "caption": caption, "access_token": token},
        timeout=30,
    )
    create_result = create.json()
    if "error" in create_result:
        print(f"Instagram media creation FAILED: {create_result['error']}")
        return False

    publish = requests.post(
        f"{GRAPH_API}/{ig_id}/media_publish",
        data={"creation_id": create_result["id"], "access_token": token},
        timeout=30,
    )
    publish_result = publish.json()
    if "error" in publish_result:
        print(f"Instagram publish FAILED: {publish_result['error']}")
        return False
    print(f"Instagram post OK: media_id={publish_result.get('id')}")
    return True


def cmd_publish():
    pending = _load_json(PENDING_PATH, None)
    if pending is None:
        raise RuntimeError(f"No {PENDING_PATH} found -- run 'generate' first")

    fb_ok = post_to_facebook(pending["image_url"], pending["caption"])
    ig_ok = post_to_instagram(pending["image_url"], pending["caption"])

    history = _load_json(HISTORY_PATH, [])
    history.append({"topic": pending["topic"], "date": pending["date_iso"], "facebook": fb_ok, "instagram": ig_ok})
    _save_json(HISTORY_PATH, history)

    os.remove(PENDING_PATH)
    print("History recorded, pending file cleaned up.")

    if not (fb_ok and ig_ok):
        raise RuntimeError(f"One or more platforms failed -- facebook={fb_ok} instagram={ig_ok}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "generate":
        cmd_generate()
    elif mode == "publish":
        cmd_publish()
    else:
        print("Usage: generate-quickhit-post.py [generate|publish]")
        sys.exit(1)
