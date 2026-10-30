from __future__ import annotations

from httpx import AsyncClient


def _base(ledger: dict) -> str:
    return f"/api/workspaces/{ledger['workspace']}/ledgers/{ledger['slug']}"


async def test_ledger_lifecycle_and_reports(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    base = _base(ledger)
    assert ledger["workspace"] == workspace["slug"]
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

    # The workspace listing and the cross-workspace listing both carry the ledger.
    in_workspace = await client.get(f"/api/workspaces/{workspace['slug']}/ledgers")
    assert [item["id"] for item in in_workspace.json()] == [ledger["id"]]
    mine = await client.get("/api/ledgers")
    assert any(item["id"] == ledger["id"] for item in mine.json())

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
    assert any(item["id"] == ledger["id"] for item in gallery.json())


async def test_entry_edit_and_history(client: AsyncClient, user: dict, ledger: dict):
    base = _base(ledger)

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
    base = _base(ledger)
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


async def test_slugs_are_unique_per_workspace(client: AsyncClient, user: dict, workspace: dict):
    first = await client.post(
        f"/api/workspaces/{workspace['slug']}/ledgers", json={"title": "Books", "template": "blank"}
    )
    assert first.status_code == 201, first.text
    assert first.json()["slug"] == "books"
    clash = await client.post(
        f"/api/workspaces/{workspace['slug']}/ledgers", json={"title": "Books", "template": "blank"}
    )
    assert clash.status_code == 409

    other = await client.post(
        "/api/workspaces", json={"name": "Second", "slug": f"{workspace['slug']}b"}
    )
    assert other.status_code == 201, other.text
    same_slug_elsewhere = await client.post(
        f"/api/workspaces/{other.json()['slug']}/ledgers",
        json={"title": "Books", "template": "blank"},
    )
    assert same_slug_elsewhere.status_code == 201, same_slug_elsewhere.text

    gone = await client.delete(f"/api/workspaces/{workspace['slug']}/ledgers/books")
    assert gone.status_code == 204
    assert (
        await client.get(f"/api/workspaces/{workspace['slug']}/ledgers/books")
    ).status_code == 404


async def test_workspace_page_addresses_are_not_ledger_slugs(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    ledgers = f"/api/workspaces/{workspace['slug']}/ledgers"
    taken = await client.post(ledgers, json={"title": "Settings", "template": "blank"})
    assert taken.status_code == 422, taken.text
    assert "workspace page" in taken.json()["error"]["message"]
    assert (await client.patch(_base(ledger), json={"slug": "new"})).status_code == 422


async def test_fiscal_year_end_is_written_into_the_ledger(
    client: AsyncClient, user: dict, workspace: dict
):
    ledgers = f"/api/workspaces/{workspace['slug']}/ledgers"
    bad = await client.post(ledgers, json={"title": "Books", "fiscalYearEnd": "13-01"})
    assert bad.status_code == 422
    res = await client.post(
        ledgers, json={"title": "Books", "template": "blank", "fiscalYearEnd": "06-30"}
    )
    assert res.status_code == 201, res.text
    meta = await client.get(f"{_base(res.json())}/meta")
    assert meta.status_code == 200, meta.text
    assert meta.json()["favaOptions"]["fiscalYearEnd"] == {"month": 6, "day": 30}
    assert meta.json()["errorsCount"] == 0


async def test_activity_can_be_scoped_to_a_workspace(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    other = await client.post(
        "/api/workspaces", json={"name": "Elsewhere", "slug": f"{workspace['slug']}c"}
    )
    assert other.status_code == 201, other.text
    elsewhere = await client.post(
        f"/api/workspaces/{other.json()['slug']}/ledgers",
        json={"title": "Far", "template": "blank"},
    )
    assert elsewhere.status_code == 201, elsewhere.text

    everything = (await client.get("/api/ledgers/activity")).json()
    assert {item["ledger"]["workspace"] for item in everything["items"]} == {
        workspace["slug"],
        other.json()["slug"],
    }
    scoped = (
        await client.get("/api/ledgers/activity", params={"workspace": workspace["slug"]})
    ).json()
    assert {item["ledger"]["workspace"] for item in scoped["items"]} == {workspace["slug"]}
    assert (await client.get("/api/ledgers/activity", params={"workspace": "nope"})).json()[
        "items"
    ] == []
