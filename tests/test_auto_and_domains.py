"""Case requirements: 'sends automatically' and 'run on a list of domains without making decisions'."""
from pipeline.config import load_icp
from pipeline.mailer import auto_send_decision
from pipeline.qualify import FAIL, PASS, UNKNOWN, gate_funding

ICP = load_icp()
ON = {"enabled": True, "skip_needs_review": True, "skip_mock_contacts": True}


def test_clean_validated_draft_is_sent():
    send, reason = auto_send_decision(ON, True, False, False, True)
    assert send and "automatically" in reason


def test_review_mock_missing_draft_and_creds_are_held():
    assert auto_send_decision(ON, True, True, False, True) == (False, "held for a human: the hook or a gate needs review")
    assert not auto_send_decision(ON, True, False, True, True)[0]          # mock contact
    assert not auto_send_decision(ON, False, False, False, True)[0]        # no validated draft
    assert not auto_send_decision(ON, True, False, False, False)[0]        # no Resend credentials


def test_auto_send_switch_off():
    assert auto_send_decision({**ON, "enabled": False}, True, False, False, True)[0] is False


def test_domain_list_company_without_stage_passes_when_allowed():
    g = gate_funding({"source": "manual", "funding_stage": None, "stage1_evidence": []}, ICP)
    assert g.result == PASS and "domain list" in g.reason


def test_news_company_without_stage_is_still_unknown():
    g = gate_funding({"source": "news", "funding_stage": None, "stage1_evidence": []}, ICP)
    assert g.result == UNKNOWN


def test_out_of_range_stage_still_fails_for_lists():
    g = gate_funding({"source": "manual", "funding_stage": "Series D", "stage1_evidence": []}, ICP)
    assert g.result == FAIL
