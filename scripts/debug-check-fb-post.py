#!/usr/bin/env python3
"""One-off fix: delete the stuck scheduled post, then publish the same
content immediately instead. Not part of the regular pipeline -- safe to
delete after use."""
import os
import json
import requests

post_id = os.environ["POST_ID"]
page_id = os.environ["FB_PAGE_ID"]
token = os.environ["FB_PAGE_ACCESS_TOKEN"]

# 1. Find today's blog post (latest topic_history entry) for its image + get
#    the exact caption we already approved from the stuck post.
with open("scripts/topic_history.json", "r", encoding="utf-8") as f:
    history = json.load(f)
slug = history[-1]["slug"]
with open(f"blog/{slug}.html", "r", encoding="utf-8") as f:
    html = f.read()
import re
m = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
schema = json.loads(m.group(1))
image_url = schema["image"]

caption = (
    "Did you know whole life insurance actually builds cash value over time? "
    "Unlike term coverage, it's there for your whole life AND grows money you can tap into later.\n\n"
    "Here in Cartersville, families are choosing whole life for that peace of mind plus the financial "
    "flexibility. It works differently than you might think, and it could be exactly what your situation needs.\n\n"
    "Want to understand how it actually works for you? Let's walk through it together: "
    "https://brannoneast.agency/life-insurance-quote.html or text me at (678) 562-6905"
)

# 2. Delete the stuck scheduled post.
del_resp = requests.delete(f"https://graph.facebook.com/v21.0/{post_id}", params={"access_token": token}, timeout=30)
print("delete:", del_resp.json())

# 3. Publish fresh, immediately (no scheduled_publish_time).
pub_resp = requests.post(
    f"https://graph.facebook.com/v21.0/{page_id}/photos",
    data={"url": image_url, "caption": caption, "access_token": token},
    timeout=30,
)
print("publish:", pub_resp.json())
