import unittest
from types import SimpleNamespace
from parli.ingest.words_press_releases import vic_slugs, fetch_vic_page

class RefreshTest(unittest.TestCase):
    def test_recent_pages_first_and_unknown_dates_retained(self):
        class Session:
            def get(self, url):
                if 'page=1' not in url:
                    return SimpleNamespace(status_code=200, text='')
                return SimpleNamespace(status_code=200, text=''.join(
                    f'<url><loc>https://www.premier.vic.gov.au/{slug}</loc>{date}</url>'
                    for slug,date in [('old','<lastmod>2020-01-01</lastmod>'),
                                      ('unknown',''),('recent','<lastmod>2026-09-10</lastmod>'),
                                      ('latest','<lastmod>2026-09-21</lastmod>')]))
        self.assertEqual(vic_slugs(Session(),16,'2026-09-07'), ['latest','recent','unknown'])

    def test_tide_text_tags_do_not_crash(self):
        class Session:
            def get(self, url):
                return SimpleNamespace(status_code=200, json=lambda: {
                    'type': 'news', 'title': 'Statement', 'published': '2026-09-19T18:05:03+10:00',
                    'body': {'content': '<p>A statement.</p>'},
                    'topicTags': [{'text': 'Premier', 'url': '/topic/premier'}, {'name': 'Health'}, {}]})
        row = fetch_vic_page(Session(), 'statement')
        self.assertEqual(row['subjects'], 'Premier; Health')
        self.assertEqual(row['date'], '2026-09-19')

if __name__ == '__main__': unittest.main()
