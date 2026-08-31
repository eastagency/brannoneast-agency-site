#!/usr/bin/env python3
"""East Agency Weekly Facebook Post Generator — runs weekly via GitHub Actions.

Repurposes that week's auto-generated blog post (scripts/topic_history.json)
into a Facebook caption, then publishes via the Meta Graph API.

Instagram is handled separately by generate-instagram-post.py, which has its
own dedicated topic rotation rather than reusing blog content.
"""

import anthropic, os, re, json
import requests

SITE = "https://brannoneast.agency"
TOPIC_HISTORY_PATH = "scripts/topic_history.json"
FACEBOOK_HISTORY_PATH = "scripts/facebook_history.json"
GRAPH_API = "https://graph.facebook.com/v21.0"
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


def load_latest_post():
    """Read the most recently auto-generated blog post's title/description/image
    straight from its own JSON-LD schema, rather than re-deriving via fragile
    meta-tag parsing."""
    history = _load_json(TOPIC_HISTORY_PATH, [])
    if not history:
        raise RuntimeError("scripts/topic_history.json is empty -- no blog post to repurpose yet")

    latest = history[-1]
    slug = latest["slug"]
    with open(f"blog/{slug}.html", "r", encoding="utf-8") as f:
        html = f.read()

    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
    if not m:
        raise RuntimeError(f"No JSON-LD schema found in blog/{slug}.html")
    schema = json.loads(m.group(1))

    return {
        "slug": slug,
        "title": schema["headline"],
        "description": schema["description"],
        "image": schema["image"],
        "url": schema.get("url", f"{SITE}/blog/{slug}.html"),
        "quote_url": schema.get("quoteUrl", f"{SITE}/quotes.html"),
    }


def already_posted(slug):
    history = _load_json(FACEBOOK_HISTORY_PATH, [])
    return any(h["slug"] == slug for h in history)


def record_posted(slug, fb_ok):
    history = _load_json(FACEBOOK_HISTORY_PATH, [])
    history.append({"slug": slug, "facebook": fb_ok})
    _save_json(FACEBOOK_HISTORY_PATH, history)


def generate_caption(post):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = (
        f'You are writing a Facebook caption for The East Agency, an independent '
        f'insurance agency in Cartersville, GA run by Brannon East. Repurpose this blog post '
        f'into a short Facebook caption:\n\n'
        f'Blog title: "{post["title"]}"\n'
        f'Blog summary: "{post["description"]}"\n'
        f'Blog link: {post["url"]}\n\n'
        f'Rules:\n'
        f'- Open with a hook in the first line (a question, a surprising number, or a bold '
        f'statement) -- not the blog title restated.\n'
        f'- 80-130 words, short punchy lines, conversational, not corporate.\n'
        f'- Mention Cartersville, GA or Bartow County naturally if it fits.\n'
        f'- End with a <p>-free, real, specific call to action -- not a generic "get a quote today" line. '
        f'Write it in whatever style genuinely fits this topic/tone (a few examples of the range, write your own '
        f'in a similar spirit, don\'t just pick one verbatim):\n'
        f'{CTA_EXAMPLES}\n'
        f'Your closing CTA sentence MUST include the literal tokens {{{{LINK}}}} and {{{{PHONE}}}} exactly '
        f'(they get replaced with the real URL and phone number afterward) -- do not write out an actual URL or number yourself.\n'
        f'- No em dashes. No "in today\'s world," "when it comes to," or similar filler.\n\n'
        f'Return ONLY a raw JSON object, no markdown fences, no commentary:\n'
        f'{{"caption": "the full caption text"}}'
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
            caption = json.loads(raw)["caption"]
            return caption.replace("{{LINK}}", post["quote_url"]).replace("{{PHONE}}", PHONE)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Caption generation attempt {attempt + 1} failed ({type(e).__name__}): {e}")
            if attempt == 2:
                raise


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


def main():
    post = load_latest_post()
    print(f"Latest blog post: {post['title']} ({post['slug']})")

    if already_posted(post["slug"]):
        print(f"Already posted '{post['slug']}' to Facebook -- no new blog post since last run. Skipping.")
        return

    caption = generate_caption(post)
    print("--- Caption ---")
    print(caption)
    print("---------------")

    fb_ok = post_to_facebook(post["image"], caption)
    record_posted(post["slug"], fb_ok)

    if not fb_ok:
        raise RuntimeError("Facebook post failed -- see logs above")


if __name__ == "__main__":
    main()
