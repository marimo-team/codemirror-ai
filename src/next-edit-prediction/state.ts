import { combineConfig, Facet } from "@codemirror/state";
import type { NextEditPredictor } from "./types.js";

interface SuggestionConfig {
	acceptOnClick: boolean;
	fetchFn: NextEditPredictor;
	onEdit?: (
		oldDoc: string,
		newDoc: string,
		from: number,
		to: number,
		insert: string,
	) => void;
	showAcceptReject: boolean;
}

export const suggestionConfigFacet = Facet.define<
	SuggestionConfig,
	SuggestionConfig
>({
	combine(value) {
		return combineConfig(value, {
			showAcceptReject: true,
			acceptOnClick: true,
			fetchFn: undefined,
			onEdit: undefined,
		});
	},
});
