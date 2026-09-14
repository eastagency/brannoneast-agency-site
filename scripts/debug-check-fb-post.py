#!/usr/bin/env python3
"""One-off debug helper: check a Facebook post's actual scheduled_publish_time.
Not part of the regular pipeline -- safe to delete after use."""
import os
import requests

post_id = os.environ["POST_ID"]
token = os.environ["FB_PAGE_ACCESS_TOKEN"]
resp = requests.get(
    f"https://graph.facebook.com/v21.0/{post_id}",
    params={"fields": "scheduled_publish_time,is_published,created_time", "access_token": token},
    timeout=30,
)
print(resp.json())
