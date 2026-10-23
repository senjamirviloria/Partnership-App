"""Safety contracts for production configuration changes (no Docker required)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("deployment", Path(__file__).parents[1] / "scripts/deploy-production.py")
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class ProductionConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.current = {key: "existing-" + key for key in deployment.PRESERVED_KEYS}
        self.current["NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY"] = self.current["TERRITORY_TRANSPORT_KEY"]

    def test_public_hostname_can_change_without_rotating_existing_keys(self):
        desired = {**self.current, "BETTER_AUTH_URL": "https://valid.example.com"}
        deployment.validate_environment(self.current, desired)

    def test_database_and_encryption_key_changes_are_rejected(self):
        for key in deployment.PRESERVED_KEYS:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                deployment.validate_environment(self.current, {**self.current, key: "different"})

    def test_missing_production_keys_are_rejected(self):
        for key in deployment.PRESERVED_KEYS:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                deployment.validate_environment({**self.current, key: ""}, {**self.current, key: ""})

    def test_transport_key_mismatch_is_rejected_even_if_unchanged(self):
        current = {**self.current, "NEXT_PUBLIC_TERRITORY_TRANSPORT_KEY": "mismatch"}
        with self.assertRaises(RuntimeError):
            deployment.validate_environment(current, current)


if __name__ == "__main__":
    unittest.main()
