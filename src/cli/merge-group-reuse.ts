export function parseMergeGroupPrNumber(headRef: string | undefined): number | undefined {
  if (!headRef) return undefined;
  const match = headRef.match(/\/pr-(\d+)-[0-9a-f]+$/i);
  if (!match) return undefined;
  return Number(match[1]);
}

export function shouldReuseMergeGroupCheck(opts: {
  checkConclusion: string | undefined;
  checkTitle: string | undefined;
  mergeGroupBaseSha: string;
  pullBaseSha: string;
}): boolean {
  if (opts.checkConclusion !== "success") return false;
  if ((opts.checkTitle ?? "").startsWith("Review skipped:")) return false;
  return opts.mergeGroupBaseSha === opts.pullBaseSha;
}
