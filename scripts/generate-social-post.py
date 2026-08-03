#!/usr/bin/env python3
"""East Agency Weekly Social Post Generator — runs weekly via GitHub Actions.

Repurposes that week's auto-generated blog post (scripts/topic_history.json)
into a Facebook + Instagram caption, then publishes both via the Meta Graph API.
"""

import anthropic, os, re, json
import requests

SITE = "https://brannoneast.agency"
TOPIC_HISTORY_PATH = "scripts/topic_history.json"
SOCIAL_HISTORY_PATH = "scripts/social_history.json"
GRAPH_API = "https://graph.facebook.com/v21.0"


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
    }


def already_posted(slug):
    history = _load_json(SOCIAL_HISTORY_PATH, [])
    return any(h["slug"] == slug for h in history)


def record_posted(slug, fb_ok, ig_ok):
    history = _load_json(SOCIAL_HISTORY_PATH, [])
    history.append({"slug": slug, "facebook": fb_ok, "instagram": ig_ok})
    _save_json(SOCIAL_HISTORY_PATH, history)


def generate_caption(post):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = (
        f'You are writing a Facebook + Instagram caption for The East Agency, an independent '
        f'insurance agency in Cartersville, GA run by Brannon East. Repurpose this blog post '
        f'into a short social caption that works on both platforms:\n\n'
        f'Blog title: "{post["title"]}"\n'
        f'Blog summary: "{post["description"]}"\n'
        f'Blog link: {post["url"]}\n\n'
        f'Rules:\n'
        f'- Open with a hook in the first line (a question, a surprising number, or a bold '
        f'statement) -- not the blog title restated.\n'
        f'- 80-130 words, short punchy lines, conversational, not corporate.\n'
        f'- Mention Cartersville, GA or Bartow County naturally if it fits.\n'
        f'- End with a clear call to action to read the full post or get a free quote.\n'
        f'- Add 3-5 relevant hashtags on their own line at the very end (e.g. #CartersvilleGA '
        f'#GeorgiaInsurance -- tailor to the actual topic).\n'
        f'- No em dashes. No "in today\'s world," "when it comes to," or similar filler.\n'
        f'- Do not include the raw blog link in the caption body -- it goes in a separate field.\n\n'
        f'Return ONLY a raw JSON object, no markdown fences, no commentary:\n'
        f'{{"caption": "the full caption text including hashtags at the end"}}'
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
            return json.loads(raw)["caption"]
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

    creation_id = create_result["id"]
    publish = requests.post(
        f"{GRAPH_API}/{ig_id}/media_publish",
        data={"creation_id": creation_id, "access_token": token},
        timeout=30,
    )
    publish_result = publish.json()
    if "error" in publish_result:
        print(f"Instagram publish FAILED: {publish_result['error']}")
        return False

    print(f"Instagram post OK: media_id={publish_result.get('id')}")
    return True


def main():
    post = load_latest_post()
    print(f"Latest blog post: {post['title']} ({post['slug']})")

    if already_posted(post["slug"]):
        print(f"Already posted '{post['slug']}' to social -- no new blog post since last run. Skipping.")
        return

    caption = generate_caption(post)
    print("--- Caption ---")
    print(caption)
    print("---------------")

    fb_ok = post_to_facebook(post["image"], caption)
    ig_ok = post_to_instagram(post["image"], caption)

    record_posted(post["slug"], fb_ok, ig_ok)

    if not fb_ok and not ig_ok:
        raise RuntimeError("Both Facebook and Instagram posts failed -- see logs above")


if __name__ == "__main__":
    main()
