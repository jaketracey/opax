import tempfile
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import bills_common as bc
import bills_fetch as bf

class BillRefreshTests(unittest.TestCase):
    def test_refresh_bypasses_saved_pages(self):
        with tempfile.TemporaryDirectory() as d, patch.object(bc,'CACHE',d):
            path=Path(bc.cache_path('billhome','r123'));path.write_text('old')
            with patch.object(bc.urllib.request,'urlopen') as network:
                self.assertEqual(bc.fetch('https://example.test','billhome','r123')[0], 'old')
                network.assert_not_called()
                response=MagicMock(); response.read.return_value=b'new'
                network.return_value.__enter__.return_value=response
                with patch.object(bc,'RATE',0):
                    self.assertEqual(bc.fetch('https://example.test','billhome','r123',refresh=True)[0], 'new')
                self.assertEqual(path.read_text(),'new')

    def test_failed_listing_is_not_successful_empty_refresh(self):
        for body in ['', '<html>Access denied</html>']:
            with self.subTest(body=body), patch.object(bc,'fetch',return_value=(body,'',False)):
                with self.assertRaises(RuntimeError): bf.enumerate_parliament(48,refresh=True)

if __name__=='__main__':unittest.main()
