"""Integrity commission reports: one adapter per commission, one shared record schema.

Each adapter module (``nsw_icac``, ``qld_ccc``, ``wa_ccc``, ``sa_icac``, ``tas_ic``,
``act_ic``, ``nt_icac``, ``nacc``) exposes ``BODY`` (a ``common.Body``) and
``collect(client) -> list[dict]``, returning report records built with
``common.report_record``. ``parli.ingest.integrity.run`` drives them and writes one
snapshot per body to the cache outside git; ``scripts/export_integrity_reports.py``
writes the public projection. See docs/DATA-INTEGRITY-COMMISSIONS.md.
"""
