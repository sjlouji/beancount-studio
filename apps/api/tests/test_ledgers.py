from __future__ import annotations

from httpx import AsyncClient


async def test_ledger_lifecycle_and_reports(client: AsyncClient, user: dict, ledger: dict):
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}"
    assert ledger["role"] == "owner" and ledger["canWrite"]
    assert ledger["lastCommit"]["subject"] == "Create ledger"

    meta = (await client.get(f"{base}/meta")).json()
    assert meta["transactionsCount"] > 1000
    assert meta["errorsCount"] == 0
    assert meta["operatingCurrencies"] == ["USD"]

    overview = await client.get(f"{base}/reports/overview", params={"conversion": "USD"})
    assert overview.status_code == 200, overview.text
    assert overview.json()["netWorth"][-1]["balance"]["USD"] > 0

    for report in ("income-statement", "balance-sheet", "trial-balance", "cash-flow"):
        res = await client.get(
            f"{base}/reports/{report}", params={"time": "2025", "conversion": "USD"}
        )
        assert res.status_code == 200, (report, res.text)

    acct = await client.get(f"{base}/reports/account/Expenses:Food", params={"conversion": "USD"})
    assert acct.status_code == 200 and acct.json()["charts"]["changes"]

    journal = await client.get(f"{base}/journal", params={"limit": 5, "types": ["Transaction"]})
    assert journal.status_code == 200
    first = journal.json()["entries"][0]
    assert first["type"] == "Transaction" and first["postings"]

    ctx = await client.get(f"{base}/entries/{first['entryHash']}")
    assert ctx.status_code == 200 and ctx.json()["slice"].startswith(first["date"])

    query = await client.get(
        f"{base}/query",
        params={"q": "SELECT account, sum(position) WHERE account ~ 'Food' GROUP BY account"},
    )
    assert query.status_code == 200 and query.json()["type"] == "table"
    bad = await client.get(f"{base}/query", params={"q": "SELEKT nothing"})
    assert bad.status_code == 400

    for page in (
        "accounts",
        "commodities",
        "documents",
        "events",
        "statistics",
        "budgets",
        "holdings",
        "attributes",
        "errors",
        "options",
    ):
        res = await client.get(f"{base}/{page}")
        assert res.status_code == 200, (page, res.text)

    # Visibility: anonymous cannot see a private ledger; public ledgers are readable.
    anon = AsyncClient(transport=client._transport, base_url="http://test")
    assert (await anon.get(f"{base}/meta")).status_code == 401
    upd = await client.patch(base, json={"visibility": "public"})
    assert upd.status_code == 200 and upd.json()["visibility"] == "public"
    assert (await anon.get(f"{base}/meta")).status_code == 200
    assert (
        await anon.put(f"{base}/files/content", json={"path": "main.bean", "content": "x"})
    ).status_code == 401
    gallery = await anon.get("/api/ledgers/gallery")
    assert any(item["slug"] == slug for item in gallery.json())


async def test_entry_edit_and_history(client: AsyncClient, user: dict, ledger: dict):
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}"

    added = await client.post(
        f"{base}/entries",
        json={
            "entries": [
                {
                    "type": "Transaction",
                    "date": "2025-12-01",
                    "payee": "Corner Cafe",
                    "narration": "Flat white",
                    "postings": [
                        {"account": "Expenses:Food:Coffee", "amount": "4.50 USD"},
                        {"account": "Assets:US:BofA:Checking", "amount": ""},
                    ],
                }
            ]
        },
    )
    assert added.status_code == 201, added.text
    entry_hash = added.json()["entryHashes"][0]
    assert added.json()["commit"]

    found = await client.get(
        f"{base}/journal", params={"search": "corner cafe", "types": ["Transaction"]}
    )
    assert found.json()["total"] == 1

    slice_res = await client.get(f"{base}/entries/{entry_hash}/slice")
    assert slice_res.status_code == 200
    source = slice_res.json()["slice"].replace("Flat white", "Oat flat white")
    updated = await client.put(
        f"{base}/entries/{entry_hash}",
        json={"source": source, "sha256sum": slice_res.json()["sha256sum"]},
    )
    assert updated.status_code == 200, updated.text
    stale = await client.put(
        f"{base}/entries/{entry_hash}",
        json={"source": source, "sha256sum": slice_res.json()["sha256sum"]},
    )
    assert stale.status_code in (400, 404)

    commits = await client.get(f"{base}/commits")
    assert commits.status_code == 200
    assert commits.json()["total"] >= 3
    detail = await client.get(f"{base}/commits/{commits.json()['commits'][0]['sha']}")
    assert detail.status_code == 200 and detail.json()["files"][0]["filename"] == "main.bean"
    assert "Oat flat white" in detail.json()["diff"]


async def test_files_check_and_write(client: AsyncClient, user: dict, ledger: dict):
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}"
    tree = await client.get(f"{base}/files/tree")
    assert tree.status_code == 200
    assert {e["name"] for e in tree.json()["entries"]} >= {"main.bean", "README.md"}

    content = await client.get(f"{base}/files/content", params={"path": "main.bean"})
    assert content.status_code == 200 and 'option "title"' in content.json()["content"]

    broken = (
        content.json()["content"]
        + '\n2025-12-02 * "Bad"\n  Expenses:Nope  1 USD\n  Expenses:Nope2  1 USD\n'
    )
    check = await client.post(f"{base}/files/check", json={"changes": {"main.bean": broken}})
    assert check.status_code == 200
    assert check.json()["errors"], "projected check should report the unbalanced transaction"
    assert check.json()["diffs"][0]["diff"].startswith("--- a/main.bean")

    created = await client.post(
        f"{base}/files", json={"path": "notes/2026.bean", "content": "; notes\n"}
    )
    assert created.status_code == 201
    assert (
        await client.post(f"{base}/files", json={"path": "notes/2026.bean", "content": ""})
    ).status_code == 422
    assert (
        await client.get(f"{base}/files/content", params={"path": "../../etc/passwd"})
    ).status_code == 422

    renamed = await client.post(
        f"{base}/files/rename", json={"oldPath": "notes/2026.bean", "newPath": "notes/2027.bean"}
    )
    assert renamed.status_code == 200
    deleted = await client.request("DELETE", f"{base}/files", json={"path": "notes/2027.bean"})
    assert deleted.status_code == 200
    assert (
        await client.request("DELETE", f"{base}/files", json={"path": "main.bean"})
    ).status_code == 422


async def test_collaborators(client: AsyncClient, user: dict, ledger: dict):
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}"
    other = AsyncClient(transport=client._transport, base_url="http://test")
    res = await other.post(
        "/api/auth/sign-up",
        json={
            "email": "bob@example.com",
            "username": "bob",
            "password": "correct-horse-battery",
            "createExampleLedger": False,
        },
    )
    assert res.status_code == 201
    assert (await other.get(f"{base}/meta")).status_code == 404

    added = await client.put(f"{base}/collaborators/bob", json={"role": "read"})
    assert added.status_code == 200
    assert (await other.get(f"{base}/meta")).status_code == 200
    assert (
        await other.post(f"{base}/files", json={"path": "x.bean", "content": ""})
    ).status_code == 403
    mine = await other.get("/api/ledgers")
    assert any(item["slug"] == slug and item["role"] == "read" for item in mine.json())

    await client.put(f"{base}/collaborators/bob", json={"role": "write"})
    assert (
        await other.post(f"{base}/files", json={"path": "x.bean", "content": ""})
    ).status_code == 201
    assert (await other.delete(base)).status_code == 403

    removed = await client.delete(f"{base}/collaborators/bob")
    assert removed.status_code == 204
    assert (await other.get(f"{base}/meta")).status_code == 404

    gone = await client.delete(base)
    assert gone.status_code == 204
    assert (await client.get(base)).status_code == 404
