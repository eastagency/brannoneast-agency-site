#!/usr/bin/env python3
"""One-off debug helper: list the Page's pending scheduled posts.
Not part of the regular pipeline -- safe to delete after use."""
import os
import requests

page_id = os.environ["FB_PAGE_ID"]
token = os.environ["FB_PAGE_ACCESS_TOKEN"]
resp = requests.get(
    f"https://graph.facebook.com/v21.0/{page_id}/scheduled_posts",
    params={"access_token": token},
    timeout=30,
)
print(resp.json())
