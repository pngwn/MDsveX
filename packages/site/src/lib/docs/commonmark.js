// CommonMark's reading of a source, for a fence flagged `commonmark`: micromark,
// which passes the whole CommonMark spec, with GFM's extensions for a fence
// also flagged `gfm`
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/**
 * @param {string} source
 * @param {boolean} [with_gfm]
 */
export function commonmark(source, with_gfm = false) {
	return with_gfm ? micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }) : micromark(source);
}
