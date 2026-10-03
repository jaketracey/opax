export interface AuditRoot {
  name: string;
  url: string;
}
export interface AcceptedAdvisory {
  package: string;
  advisory: string;
  exposure: string;
  reason: string;
}
// Unknown root advisories fail closed, including unclassified exposure. Advisory
// chains are deduplicated to their root; acceptance never suppresses a new GHSA.
export function unacceptedAdvisories(
  roots: AuditRoot[],
  accepted: AcceptedAdvisory[],
) {
  return roots.filter(
    (root) =>
      !accepted.some(
        (item) =>
          item.package === root.name &&
          item.advisory === root.url.split('/').pop(),
      ),
  );
}
