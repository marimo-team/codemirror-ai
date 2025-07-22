import { Facet } from "@codemirror/state";
import type { NextEditPredictor } from "./types.js";

export const suggestionConfigFacet = Facet.define<
	{
		acceptOnClick: boolean;
		fetchFn: NextEditPredictor;
		onEdit?: (
			oldDoc: string,
			newDoc: string,
			from: number,
			to: number,
			insert: string,
		) => void;
	},
	{
		acceptOnClick: boolean;
		fetchFn: NextEditPredictor | undefined;
		onEdit?: (
			oldDoc: string,
			newDoc: string,
			from: number,
			to: number,
			insert: string,
		) => void;
	}
>({
	combine(value) {
		return {
			acceptOnClick: !!value.at(-1)?.acceptOnClick,
			fetchFn: value.at(-1)?.fetchFn,
			onEdit: value.at(-1)?.onEdit,
		};
	},
});
