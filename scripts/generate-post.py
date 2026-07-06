#!/usr/bin/env python3
"""East Agency Auto Blog Post Generator — runs weekly via GitHub Actions."""

import anthropic, os, re, json
from datetime import date

# 29 topics — weekly rotation, one full cycle = ~7 months, then repeats with fresh content
TOPICS = [
    {"keyword": "auto insurance rates Georgia 2026",                                       "cat": "Auto Insurance",    "img": "/assets/categories/auto.png",        "quote": "/auto-insurance-quote.html"},
    {"keyword": "life insurance for young families in Georgia",                            "cat": "Life Insurance",    "img": "/assets/categories/life.png",         "quote": "/life-insurance-quote.html"},
    {"keyword": "small business insurance Georgia what you need",                          "cat": "Business",          "img": "/assets/categories/business.png",     "quote": "/business-insurance-quote.html"},
    {"keyword": "motorcycle insurance Georgia tips and coverage",                          "cat": "Motorcycle",        "img": "/assets/categories/motorcycle.png",   "quote": "/motorcycle-insurance-quote.html"},
    {"keyword": "boat insurance Lake Allatoona Georgia",                                   "cat": "Boat Insurance",    "img": "/assets/categories/boat.png",         "quote": "/boat-insurance-quote.html"},
    {"keyword": "renters insurance Georgia what does it cover",                            "cat": "Renters Insurance", "img": "/assets/categories/renters.png",      "quote": "/renters-insurance-quote.html"},
    {"keyword": "farm and agricultural insurance Bartow County Georgia",                   "cat": "Farm & Ag",         "img": "/assets/categories/business.png",     "quote": "/business-insurance-quote.html"},
    {"keyword": "classic car insurance Georgia collector vehicles",                        "cat": "Classic Car",       "img": "/assets/categories/classic-car.png",  "quote": "/classic-car-insurance-quote.html"},
    {"keyword": "flood insurance Georgia do I need it",                                    "cat": "Flood Insurance",   "img": "/assets/categories/flood.png",        "quote": "/flood-insurance-quote.html"},
    {"keyword": "landlord insurance Georgia rental property coverage",                     "cat": "Landlord",          "img": "/assets/categories/landlord.png",     "quote": "/landlord-insurance-quote.html"},
    {"keyword": "health insurance self employed Georgia options",                          "cat": "Health Insurance",  "img": "/assets/categories/health.png",       "quote": "/health-insurance-quote.html"},
    {"keyword": "RV insurance Georgia full timer seasonal coverage",                       "cat": "RV Insurance",      "img": "/assets/categories/rv.png",           "quote": "/rv-insurance-quote.html"},
    {"keyword": "teen driver car insurance Georgia how to save money",                     "cat": "Auto Insurance",    "img": "/assets/categories/auto.png",         "quote": "/auto-insurance-quote.html"},
    {"keyword": "home and auto insurance bundle Georgia savings",                          "cat": "Home Insurance",    "img": "/assets/categories/home.png",         "quote": "/home-insurance-quote.html"},
    {"keyword": "commercial property insurance Cartersville GA data centers manufacturers","cat": "Business",          "img": "/assets/categories/business.png",     "quote": "/business-insurance-quote.html"},
    {"keyword": "SR-22 insurance Georgia how to get it",                                  "cat": "Auto Insurance",    "img": "/assets/categories/auto.png",         "quote": "/auto-insurance-quote.html"},
    {"keyword": "term life vs whole life insurance Georgia",                               "cat": "Life Insurance",    "img": "/assets/categories/life.png",         "quote": "/life-insurance-quote.html"},
    {"keyword": "collectibles insurance Georgia what to insure",                          "cat": "Collectibles",      "img": "/assets/categories/collectible.png",  "quote": "/collectible-insurance-quote.html"},
    {"keyword": "wedding and event insurance Georgia what it covers",                      "cat": "Special Event",     "img": "/assets/categories/event.png",        "quote": "/special-event-insurance-quote.html"},
    {"keyword": "Georgia homeowners insurance roof age and rates",                         "cat": "Home Insurance",    "img": "/assets/categories/home.png",         "quote": "/home-insurance-quote.html"},
    {"keyword": "gap insurance Georgia car loan coverage",                                 "cat": "Auto Insurance",    "img": "/assets/categories/auto.png",         "quote": "/auto-insurance-quote.html"},
    {"keyword": "Lake Allatoona vacation home and cabin insurance Georgia",                "cat": "Home Insurance",    "img": "/assets/categories/home.png",         "quote": "/home-insurance-quote.html"},
    {"keyword": "umbrella insurance Georgia extra liability coverage",                     "cat": "Home Insurance",    "img": "/assets/categories/home.png",         "quote": "/home-insurance-quote.html"},
    {"keyword": "car insurance after accident Georgia rates go up",                        "cat": "Auto Insurance",    "img": "/assets/categories/auto.png",         "quote": "/auto-insurance-quote.html"},
    {"keyword": "independent insurance agent Georgia vs direct",                           "cat": "Insurance Tips",    "img": "/assets/categories/home.png",         "quote": "/quotes.html"},
    {"keyword": "Georgia minimum car insurance requirements 2026",                         "cat": "Auto Insurance",    "img": "/assets/categories/auto.png",         "quote": "/auto-insurance-quote.html"},
    {"keyword": "business liability insurance Cartersville GA",                            "cat": "Business",          "img": "/assets/categories/business.png",     "quote": "/business-insurance-quote.html"},
    {"keyword": "motorcycle insurance Georgia seasonal riders save",                       "cat": "Motorcycle",        "img": "/assets/categories/motorcycle.png",   "quote": "/motorcycle-insurance-quote.html"},
    {"keyword": "collector car vs regular auto insurance Georgia",                         "cat": "Classic Car",       "img": "/assets/categories/classic-car.png",  "quote": "/classic-car-insurance-quote.html"},
]


def pick_topic():
    today = date.today()
    iso = today.isocalendar()
    index = ((iso[0] - 2026) * 52 + iso[1]) % len(TOPICS)
    return TOPICS[index]


def generate_content(topic):
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = (
        f'You are the content writer for The East Agency — an independent insurance agency in Cartersville, GA run by Brannon East.\n'
        f'Write a blog post targeting the search keyword: "{topic["keyword"]}"\n\n'
        f'Rules:\n'
        f'- Warm, conversational tone. Not corporate. Brannon speaks like a trusted neighbor.\n'
        f'- Mention Cartersville, GA or Bartow County at least once naturally.\n'
        f'- Mention that The East Agency shops 20+ carriers to find the best rate.\n'
        f'- 700-900 words of article body content.\n'
        f'- End with a <p> calling readers to get a free quote from The East Agency.\n\n'
        f'Return ONLY a raw JSON object — no markdown fences, no commentary:\n'
        f'{{\n'
        f'  "title": "Engaging title, 60 chars max, keyword included naturally",\n'
        f'  "slug": "url-friendly-slug-no-extension",\n'
        f'  "excerpt": "2-sentence card teaser under 160 characters",\n'
        f'  "html_body": "Article HTML using only <h2><p><ul><li><strong> tags. 3-4 h2 sections. Real numbers where helpful."\n'
        f'}}'
    )
    for attempt in range(3):
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = msg.content[0].text.strip()
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw.strip())
            return json.loads(raw)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Attempt {attempt + 1} failed ({type(e).__name__}): {e}")
            if attempt == 2:
                raise


def build_post(topic, data, date_iso, date_display):
    with open("blog/home-insurance-cost-cartersville-ga.html", "r", encoding="utf-8") as f:
        html = f.read()

    # head
    html = re.sub(r"<title>.*?</title>", f"<title>{data['title']} | The East Agency</title>", html)
    html = re.sub(r'(<meta name="description" content=")[^"]*"', f"\\g<1>{data['excerpt']}\"", html)
    html = re.sub(r'(<link rel="canonical" href=")[^"]*"', f"\\g<1>https://www.brannoneast.agency/blog/{data['slug']}.html\"", html)
    html = re.sub(r'(<meta property="og:title" content=")[^"]*"', f"\\g<1>{data['title']}\"", html)
    html = re.sub(r'(<meta property="og:description" content=")[^"]*"', f"\\g<1>{data['excerpt']}\"", html)
    html = re.sub(r'(<meta property="og:image" content=")[^"]*"', f"\\g<1>https://www.brannoneast.agency{topic['img']}\"", html)

    schema = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": data["title"],
        "description": data["excerpt"],
        "datePublished": date_iso,
        "image": f"https://www.brannoneast.agency{topic['img']}",
        "author": {"@type": "Person", "name": "Brannon East"},
        "publisher": {"@type": "Organization", "name": "The East Agency", "url": "https://www.brannoneast.agency"},
        "url": f"https://www.brannoneast.agency/blog/{data['slug']}.html"
    }
    html = re.sub(
        r'<script type="application/ld\+json">.*?</script>',
        f'<script type="application/ld+json">\n{json.dumps(schema, indent=2)}\n</script>',
        html, flags=re.DOTALL
    )

    # article body — replace everything between <article class="post-body"> and <div class="post-share">
    article_open = '<article class="post-body">'
    share_open = '<div class="post-share">'
    i1 = html.index(article_open) + len(article_open)
    i2 = html.index(share_open)

    new_body = (
        f'\n    <header class="post-header">\n'
        f'      <span class="blog-cat-badge" style="position:static;display:inline-block;margin-bottom:12px">{topic["cat"]}</span>\n'
        f'      <h1 class="post-title">{data["title"]}</h1>\n'
        f'      <div class="post-meta">\n'
        f'        <time datetime="{date_iso}">{date_display}</time>\n'
        f'        <span>·</span>\n'
        f'        <span>By Brannon East</span>\n'
        f'      </div>\n'
        f'      <img src="{topic["img"]}" alt="{data["title"]}" style="width:100%;border-radius:12px;margin:24px 0;max-height:400px;object-fit:cover">\n'
        f'    </header>\n'
        f'    {data["html_body"]}\n'
        f'    '
    )
    html = html[:i1] + new_body + html[i2:]

    # share URL
    html = re.sub(
        r'sharer\.php\?u=https%3A%2F%2F[^"]+',
        f"sharer.php?u=https%3A%2F%2Fbrannoneast.agency%2Fblog%2F{data['slug']}.html",
        html
    )

    # sidebar — update CTA text and quote link (all occurrences, covers both sidebar and in-article)
    html = html.replace(
        "We shop 20+ carriers to find the best home insurance rate in Georgia.",
        f"We shop 20+ carriers to find the best {topic['cat'].lower()} rate in Georgia."
    )
    html = html.replace('href="/home-insurance-quote.html"', f'href="{topic["quote"]}"')

    out_path = f"blog/{data['slug']}.html"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return out_path


def update_blog_index(topic, data, date_display):
    with open("blog.html", "r", encoding="utf-8") as f:
        html = f.read()

    card = (
        f'<article class="blog-card">\n'
        f'      <div class="blog-card-img" style="background-image:url(\'{topic["img"]}\')">\n'
        f'        <span class="blog-cat-badge">{topic["cat"]}</span>\n'
        f'      </div>\n'
        f'      <div class="blog-card-body">\n'
        f'        <time>{date_display}</time>\n'
        f'        <h2>{data["title"]}</h2>\n'
        f'        <p>{data["excerpt"]}</p>\n'
        f'        <a href="/blog/{data["slug"]}.html" class="card-read-more">Read Article &rarr;</a>\n'
        f'      </div>\n'
        f'    </article>\n    '
    )

    marker = '<div class="blog-grid">'
    i = html.index(marker) + len(marker)
    html = html[:i] + "\n    " + card + html[i:]

    with open("blog.html", "w", encoding="utf-8") as f:
        f.write(html)


def main():
    topic = pick_topic()
    print(f"Topic: {topic['keyword']}")

    data = generate_content(topic)
    print(f"Title: {data['title']}")
    print(f"Slug:  {data['slug']}")

    today = date.today()
    date_iso = today.isoformat()
    date_display = f"{today.strftime('%B')} {today.day}, {today.year}"

    post_path = build_post(topic, data, date_iso, date_display)
    update_blog_index(topic, data, date_display)
    print(f"Written:  {post_path}")
    print(f"Index updated: blog.html")

    env_file = os.environ.get("GITHUB_ENV", "")
    if env_file:
        with open(env_file, "a") as f:
            f.write(f"POST_TITLE={data['title']}\n")


if __name__ == "__main__":
    main()
