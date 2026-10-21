"""Doctor accounts and sign-in (FR-01, §10.4): identity only, hashed passwords, lockout, admin-only."""

import io
import json
from pathlib import Path

import pytest
from docx import Document
from fastapi.testclient import TestClient

from app.main import create_app
from app.render.hash import note_hash
from app.security.accounts import AccountError, AccountStore, LoginThrottle
from tests.conftest import make_settings

PW = "correct horse battery"
ROOT = Path(__file__).resolve().parents[2]


def real_client(**kw):
    """An app with NO demo sign-in: only real accounts."""
    s = make_settings(dev_auth_enabled=False, **kw)
    return TestClient(create_app(s), raise_server_exceptions=False), s


def setup(c, username="dr.nankya", name="Dr. A. Nankya", password=PW):
    return c.post("/auth/setup", json={"username": username, "name": name, "password": password})


def bearer(r):
    return {"Authorization": f"Bearer {r.json()['token']}"}


# ---- store ---------------------------------------------------------------------------------------
def test_passwords_are_salted_and_hashed_never_stored(tmp_path):
    store = AccountStore(tmp_path / "a.json")
    store.create("alice01", "Dr. Alice", PW)
    store.create("bob0001", "Dr. Bob", PW)
    raw = (tmp_path / "a.json").read_text()
    assert PW not in raw
    users = json.loads(raw)["users"]
    assert users[0]["hash"] != users[1]["hash"]  # same password, different salt
    assert set(users[0]) == {
        "username",
        "display_name",
        "role",
        "salt",
        "iterations",
        "hash",
        "created",
    }


def test_verify_accepts_right_password_only_and_ignores_username_case(tmp_path):
    store = AccountStore(tmp_path / "a.json")
    store.create("alice01", "Dr. Alice", PW)
    assert store.verify("ALICE01", PW).display_name == "Dr. Alice"
    assert store.verify("alice01", PW + "x") is None
    assert store.verify("nobody", PW) is None


@pytest.mark.parametrize(
    "u,n,p,code",
    [
        ("A", "x", PW, "E_USERNAME_INVALID"),
        ("has space", "x", PW, "E_USERNAME_INVALID"),
        ("alice01", " ", PW, "E_NAME_INVALID"),
        ("alice01", "x", "short", "E_PASSWORD_WEAK"),
    ],
)
def test_invalid_accounts_are_refused(tmp_path, u, n, p, code):
    with pytest.raises(AccountError) as e:
        AccountStore(tmp_path / "a.json").create(u, n, p)
    assert e.value.code == code


def test_duplicate_and_last_admin_protection(tmp_path):
    s = AccountStore(tmp_path / "a.json")
    s.create("admin01", "Admin", PW, "admin")
    s.create("doc0001", "Doc", PW)
    with pytest.raises(AccountError) as e:
        s.create("DOC0001", "Other", PW)
    assert e.value.code == "E_USERNAME_TAKEN"
    with pytest.raises(AccountError) as e:
        s.remove("admin01")
    assert e.value.code == "E_LAST_ADMIN"
    s.remove("doc0001")
    assert [a.username for a in s.list()] == ["admin01"]


def test_password_change_invalidates_the_old_password(tmp_path):
    s = AccountStore(tmp_path / "a.json")
    s.create("doc0001", "Doc", PW)
    s.set_password("doc0001", "another long passphrase")
    assert s.verify("doc0001", PW) is None
    assert s.verify("doc0001", "another long passphrase")


def test_throttle_blocks_after_n_failures_then_recovers():
    clock = [0.0]
    t = LoginThrottle(3, 60, now=lambda: clock[0])
    for _ in range(3):
        t.failed("a")
    assert t.blocked("a") and not t.blocked("b")
    clock[0] = 61
    assert not t.blocked("a")


# ---- HTTP ------------------------------------------------------------------------------------------------
def test_first_run_status_then_setup_creates_the_first_admin_once():
    c, _ = real_client()
    assert c.get("/auth/status").json() == {
        "setup_needed": True,
        "demo_login": False,
        "open_access": False,
    }
    r = setup(c)
    assert r.status_code == 200
    assert r.json()["user"] == {"username": "dr.nankya", "name": "Dr. A. Nankya", "role": "admin"}
    assert c.get("/auth/status").json()["setup_needed"] is False
    again = setup(c, username="intruder1")
    assert again.status_code == 409
    assert again.json() == {"error": "E_SETUP_DONE", "class": "terminal"}


def test_login_succeeds_and_the_token_works_and_names_the_user():
    c, _ = real_client()
    setup(c)
    r = c.post("/auth/login", json={"username": "dr.nankya", "password": PW})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Dr. A. Nankya"
    assert c.post("/auth/refresh", headers=bearer(r)).status_code == 200


def test_bad_password_and_unknown_user_look_identical():
    c, _ = real_client()
    setup(c)
    a = c.post("/auth/login", json={"username": "dr.nankya", "password": "wrong password!"})
    b = c.post("/auth/login", json={"username": "nobody1", "password": "wrong password!"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"error": "E_BAD_CREDENTIALS", "class": "recoverable"}


def test_repeated_failures_lock_the_username_for_a_while():
    c, _ = real_client(login_max_failures=3)
    setup(c)
    for _ in range(3):
        c.post("/auth/login", json={"username": "dr.nankya", "password": "wrong password!"})
    r = c.post("/auth/login", json={"username": "dr.nankya", "password": PW})
    assert r.status_code == 429 and r.json()["error"] == "E_TOO_MANY_ATTEMPTS"


def test_demo_login_is_off_by_default_and_refused():
    c, _ = real_client()
    assert c.post("/auth/dev-login", json={"name": "x"}).status_code == 404
    assert c.get("/auth/status").json()["demo_login"] is False


def test_admin_adds_lists_resets_and_removes_doctors():
    c, _ = real_client()
    admin = bearer(setup(c))
    body = {"username": "dr.okello", "name": "Dr. B. Okello", "password": PW}
    r = c.post("/admin/users", json=body, headers=admin)
    assert r.status_code == 200 and r.json()["user"]["role"] == "doctor"
    names = {u["username"] for u in c.get("/admin/users", headers=admin).json()["users"]}
    assert names == {"dr.nankya", "dr.okello"}
    new_pw = "a brand new passphrase"
    reset = c.post("/admin/users/dr.okello/password", json={"password": new_pw}, headers=admin)
    assert reset.status_code == 204
    assert c.post("/auth/login", json={"username": "dr.okello", "password": PW}).status_code == 401
    assert (
        c.post("/auth/login", json={"username": "dr.okello", "password": new_pw}).status_code == 200
    )
    assert c.delete("/admin/users/dr.okello", headers=admin).status_code == 204
    assert (
        c.post("/auth/login", json={"username": "dr.okello", "password": new_pw}).status_code == 401
    )


def test_a_doctor_cannot_use_admin_routes_and_an_admin_cannot_remove_themselves():
    c, _ = real_client()
    admin = bearer(setup(c))
    body = {"username": "dr.okello", "name": "Dr. B. Okello", "password": PW}
    c.post("/admin/users", json=body, headers=admin)
    doctor = bearer(c.post("/auth/login", json={"username": "dr.okello", "password": PW}))
    assert c.get("/admin/users", headers=doctor).status_code == 403
    assert c.post("/admin/users", json=body, headers=doctor).status_code == 403
    assert c.delete("/admin/users/dr.nankya", headers=doctor).status_code == 403
    assert c.get("/admin/users").status_code == 401
    assert c.delete("/admin/users/dr.nankya", headers=admin).status_code == 409


def test_account_file_holds_no_plain_password_and_only_identity_fields():
    c, s = real_client()
    setup(c)
    raw = s.accounts_file.read_text()
    assert PW not in raw
    assert "transcript" not in raw and "segment" not in raw


def test_export_footer_names_the_signed_in_doctor_not_the_username():
    c, _ = real_client()
    r = setup(c)
    note = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))
    out = c.post(
        "/render?mode=final&format=docx",
        json={"note": note, "approved_hash": note_hash(note)},
        headers=bearer(r),
    )
    d = Document(io.BytesIO(out.content))
    footer = "\n".join(p.text for p in d.sections[0].footer.paragraphs)
    assert "approved by Dr. A. Nankya" in footer


def test_admin_user_list_uses_the_same_field_names_as_sign_in():
    c, _ = real_client()
    admin = bearer(setup(c))
    users = c.get("/admin/users", headers=admin).json()["users"]
    assert users == [{"username": "dr.nankya", "name": "Dr. A. Nankya", "role": "admin"}]
