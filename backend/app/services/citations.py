import logging
from typing import Any, Dict, List, Optional, Set
import httpx
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)

OPENALEX_HEADERS = {
    "User-Agent": "RESIN-CitationGraph/1.0 (mailto:academic-research@resin.app)"
}


async def sync_citation_edges(paper_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Syncs direct and shared citation edges for saved papers using OpenAlex.
    Stores discovered edges in the `citation_edges` Supabase table.
    """
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Supabase client not initialized")

    # 1. Fetch papers from DB
    if paper_ids and len(paper_ids) > 0:
        res = client.table("papers").select("id, title, doi, arxiv_id").in_("id", paper_ids).execute()
        papers = res.data or []
    else:
        # Fetch all papers that exist in user_papers
        res = client.table("user_papers").select("paper_id, papers(id, title, doi, arxiv_id)").execute()
        raw_papers = res.data or []
        seen = set()
        papers = []
        for r in raw_papers:
            p = r.get("papers")
            if p and p.get("id") and p["id"] not in seen:
                seen.add(p["id"])
                papers.append(p)

    if len(papers) < 2:
        return {
            "status": "success",
            "message": "Not enough papers to compute citations (minimum 2 needed).",
            "direct_count": 0,
            "shared_count": 0,
            "total_edges": 0,
            "edges": [],
        }

    # 2. Map DOIs and papers
    doi_map: Dict[str, Dict[str, Any]] = {}
    papers_without_doi: List[Dict[str, Any]] = []

    for p in papers:
        doi = p.get("doi")
        if doi and isinstance(doi, str) and len(doi.strip()) > 3:
            clean_doi = doi.replace("https://doi.org/", "").strip().lower()
            doi_map[clean_doi] = {
                "id": str(p["id"]),
                "title": p.get("title", ""),
                "raw_doi": clean_doi,
            }
        else:
            papers_without_doi.append(p)

    # 3. Batch fetch references from OpenAlex by DOI in chunks of 25
    works: List[Dict[str, Any]] = []
    dois = list(doi_map.keys())

    async with httpx.AsyncClient(timeout=15.0, headers=OPENALEX_HEADERS) as http_client:
        for i in range(0, len(dois), 25):
            chunk = [doi_map[k]["raw_doi"] for k in dois[i : i + 25]]
            pipe_filter = "|".join(chunk)
            url = f"https://api.openalex.org/works?filter=doi:{pipe_filter}&per_page=25"
            try:
                resp = await http_client.get(url)
                if resp.status_code == 200:
                    works.extend(resp.json().get("results", []))
            except Exception as e:
                logger.warning(f"Failed to fetch batch DOIs from OpenAlex: {e}")

        # 4. For remaining papers without DOI match, try OpenAlex title search
        matched_pids = set()
        for w in works:
            raw_doi = (w.get("doi") or "").replace("https://doi.org/", "").strip().lower()
            if raw_doi in doi_map:
                matched_pids.add(doi_map[raw_doi]["id"])

        unmatched = [p for p in papers if str(p["id"]) not in matched_pids]
        for p in unmatched[:15]:  # limit to top 15 to keep latency fast
            title = p.get("title")
            if not title or len(title.strip()) < 5:
                continue
            try:
                url = "https://api.openalex.org/works"
                params = {"search": title.strip(), "per_page": 1}
                resp = await http_client.get(url, params=params)
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        top_work = results[0]
                        # Attach mapped paper ID directly
                        top_work["_override_pid"] = str(p["id"])
                        top_work["_override_title"] = title
                        works.append(top_work)
            except Exception as e:
                logger.warning(f"Title fallback lookup failed for '{title}': {e}")

    # 5. Build lookup maps: OpenAlex ID -> internal paper_id, and internal paper_id -> referenced_works set
    oa_to_pid: Dict[str, str] = {}
    pid_to_refs: Dict[str, Set[str]] = {}
    pid_to_title: Dict[str, str] = {}

    for w in works:
        pid = None
        title = ""
        if "_override_pid" in w:
            pid = w["_override_pid"]
            title = w.get("_override_title", "")
        else:
            raw_doi = (w.get("doi") or "").replace("https://doi.org/", "").strip().lower()
            if raw_doi in doi_map:
                pid = doi_map[raw_doi]["id"]
                title = doi_map[raw_doi]["title"]

        if pid:
            oa_id = w.get("id")
            if oa_id:
                oa_to_pid[oa_id] = pid
            refs = set(w.get("referenced_works", []))
            pid_to_refs[pid] = refs
            pid_to_title[pid] = title

    # 6. Detect DIRECT citations: Paper A cited Paper B
    direct_edges: List[Dict[str, Any]] = []
    for pidA, refsA in pid_to_refs.items():
        for oaB, pidB in oa_to_pid.items():
            if pidA != pidB and oaB in refsA:
                direct_edges.append({
                    "paper_id_a": pidA,
                    "paper_id_b": pidB,
                    "edge_type": "direct_citation",
                    "weight": 1.0,
                })

    # 7. Detect SHARED citations (Bibliographic coupling: A and B both cite work C)
    shared_edges: List[Dict[str, Any]] = []
    pids = list(pid_to_refs.keys())
    for i in range(len(pids)):
        for j in range(i + 1, len(pids)):
            pA = pids[i]
            pB = pids[j]
            common = pid_to_refs[pA].intersection(pid_to_refs[pB])
            if len(common) >= 1:
                # Order IDs consistently to prevent duplicate pairs
                p1, p2 = (pA, pB) if pA < pB else (pB, pA)
                shared_edges.append({
                    "paper_id_a": p1,
                    "paper_id_b": p2,
                    "edge_type": "shared_citation",
                    "weight": float(len(common)),
                })

    all_edges_to_save = direct_edges + shared_edges

    # 8. Upsert into Supabase citation_edges
    if all_edges_to_save:
        try:
            # Batch upsert in chunks of 50
            for k in range(0, len(all_edges_to_save), 50):
                batch = all_edges_to_save[k : k + 50]
                client.table("citation_edges").upsert(batch).execute()
            logger.info(f"Successfully upserted {len(all_edges_to_save)} citation edges into Supabase.")
        except Exception as e:
            logger.error(f"Failed to upsert citation edges into Supabase: {e}")
            raise e

    return {
        "status": "success",
        "direct_count": len(direct_edges),
        "shared_count": len(shared_edges),
        "total_edges": len(all_edges_to_save),
        "edges": all_edges_to_save,
    }
