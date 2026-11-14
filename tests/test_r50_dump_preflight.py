"""Unit tests for the R50 read-only dump inventory (no DB required)."""
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "r50-dump-preflight.py"
spec = importlib.util.spec_from_file_location("r50_dump_preflight", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreflightTests(unittest.TestCase):
    def test_legacy_schema_blocks_direct_restore(self):
        toc = """
12; 1259 19605 TABLE public project postgres
13; 0 19605 TABLE DATA public project postgres
14; 1259 21001 TABLE public project_snapshots postgres
15; 0 21001 TABLE DATA public project_snapshots postgres
16; 1259 999 TABLE storage objects postgres
17; 1259 200 TABLE auth users postgres
"""
        result = module.inventory(toc)
        self.assertTrue(result["important_tables"]["public.project"]["schema"])
        self.assertTrue(result["important_tables"]["public.project"]["data_section"])
        self.assertFalse(result["important_tables"]["public.projects"]["schema"])
        self.assertEqual(result["objects_by_type"]["TABLE"], 4)
        self.assertEqual(result["objects_by_type"]["TABLE DATA"], 2)
        self.assertFalse(result["safe_to_restore_directly_to_geocauce"])
        self.assertTrue(any("Legacy" in message for message in result["warnings"]))

    def test_empty_inventory_is_conservative(self):
        result = module.inventory("; Archive with no tables\n")
        self.assertFalse(result["safe_to_restore_directly_to_geocauce"])
        self.assertTrue(result["warnings"])


if __name__ == "__main__":
    unittest.main()
