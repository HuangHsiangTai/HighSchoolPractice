"""Offline behavior checks for the Google Drive practice downloader."""
import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / '.agents/skills/download-practices/scripts/download.py'
spec = importlib.util.spec_from_file_location('download_practices', SCRIPT)
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)


class Response:
    def __init__(self, data=None, content=b'', error=None):
        self.data, self.content, self.error = data, content, error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data

    def iter_content(self, size):
        yield self.content

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class DownloadTests(unittest.TestCase):
    def test_children_requests_every_page(self):
        http = mock.Mock()
        http.get.side_effect = [Response({'files': [{'name': 'one'}], 'nextPageToken': 'next'}),
                                Response({'files': [{'name': 'two'}]})]
        self.assertEqual([x['name'] for x in downloader.children(http, 'folder')], ['one', 'two'])
        self.assertEqual(http.get.call_args_list[1].kwargs['params']['pageToken'], 'next')

    def test_folder_ancestry_and_outside_root(self):
        http = mock.Mock()
        http.get.side_effect = [Response({'name': 'exam', 'mimeType': downloader.FOLDER, 'parents': ['subject']}),
                                Response({'name': 'math', 'mimeType': downloader.FOLDER, 'parents': [downloader.ROOT]})]
        self.assertEqual(downloader.relative_path(http, 'exam'), Path('math/exam'))
        http.get.side_effect = [Response({'name': 'other', 'mimeType': downloader.FOLDER, 'parents': []})]
        with self.assertRaisesRegex(ValueError, 'ancestry'):
            downloader.relative_path(http, 'other')

    def test_download_identical_conflict_and_failure_preserve_files(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'photo.jpg'
            http = mock.Mock()
            http.get.return_value = Response(content=b'image one')
            self.assertEqual(downloader.download(http, {'id': 'a'}, target), 'downloaded')
            self.assertEqual(downloader.download(http, {'id': 'a'}, target), 'identical')
            http.get.return_value = Response(content=b'different')
            self.assertEqual(downloader.download(http, {'id': 'a'}, target), 'conflict')
            http.get.return_value = Response(error=RuntimeError('network error'))
            with self.assertRaisesRegex(RuntimeError, 'network error'):
                downloader.download(http, {'id': 'a'}, target)
            self.assertEqual(target.read_bytes(), b'image one')
            self.assertEqual(list(Path(temp).iterdir()), [target])

    def test_recursive_images_and_incomplete_listing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def children(_http, folder):
                if folder == 'chosen':
                    return iter([{'id': 'nested', 'name': 'nested', 'mimeType': downloader.FOLDER},
                                 {'id': 'text', 'name': 'notes.txt', 'mimeType': 'text/plain'}])
                if folder == 'nested':
                    return iter([{'id': 'photo', 'name': 'one.png', 'mimeType': 'image/png'},
                                 {'id': 'broken', 'name': 'broken', 'mimeType': downloader.FOLDER}])
                raise RuntimeError('listing failed')

            http = mock.Mock()
            http.get.return_value = Response(content=b'photo')
            output, errors = io.StringIO(), io.StringIO()
            with mock.patch.object(downloader, 'REPO', root), mock.patch.object(downloader, 'session', return_value=http), \
                 mock.patch.object(downloader, 'relative_path', return_value=Path('grade_11')), \
                 mock.patch.object(downloader, 'children', side_effect=children), \
                 mock.patch('sys.argv', ['download.py', 'chosen']), \
                 contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                self.assertEqual(downloader.main(), 1)
            self.assertEqual((root / 'grade_11/nested/one.png').read_bytes(), b'photo')
            self.assertFalse((root / 'grade_11/notes.txt').exists())
            self.assertIn('failed=1', output.getvalue())
            self.assertIn('listing failed', errors.getvalue())

    def test_destination_mismatch_fails_before_listing(self):
        with mock.patch.object(downloader, 'session'), \
             mock.patch.object(downloader, 'relative_path', return_value=Path('actual')), \
             mock.patch.object(downloader, 'children') as children, \
             mock.patch('sys.argv', ['download.py', 'chosen', '--destination', 'other']):
            with self.assertRaisesRegex(ValueError, 'Drive maps to'):
                downloader.main()
            children.assert_not_called()


if __name__ == '__main__':
    unittest.main()
