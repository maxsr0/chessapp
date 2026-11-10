"""Test setup: a throwaway SQLite DB and no background worker.

Env vars must be set before `app` is imported, since app.db reads them at import time.
"""

import os
import tempfile

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["RUN_WORKER"] = "0"
