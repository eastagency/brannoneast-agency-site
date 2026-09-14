#!/usr/bin/env python3
"""One-off fix: reschedule a stuck scheduled Facebook post to fire soon.
Not part of the regular pipeline -- safe to delete after use."""
import os
import time
import requests

post_id = os.environ["POST_ID"]
token = os.environ["FB_PAGE_ACCESS_TOKEN"]
new_time = int(time.time()) + 12 * 60  # 12 minutes from now

resp = requests.post(
    f"https://graph.facebook.com/v21.0/{post_id}",
    data={"scheduled_publish_time": new_time, "access_token": token},
    timeout=30,
)
print(resp.json())
