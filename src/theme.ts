import { EditorView } from "@codemirror/view";

// Theme for AI features
export const aiTheme = EditorView.baseTheme({
  ".cm-ai-tooltip": {
    userSelect: "none",
    pointerEvents: "none",
    fontFamily: "system-ui, -apple-system, sans-serif",
    position: "absolute",
    right: "8px",
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "12px",
    backgroundColor: "#0E639C",
    color: "#ffffff",
    border: "1px solid transparent",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    zIndex: "999",
    "& > span": {
      pointerEvents: "auto",
      cursor: "pointer",
      display: "inline-block",
      padding: "2px",
    },
    "&:hover": {
      backgroundColor: "#1177bb",
    },
  },
  ".cm-ai-input-container": {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    width: "calc(100% + 7px)",
    padding: "5px 5px",
    margin: "0 -6px",
    backgroundColor: "light-dark(rgb(241, 243, 245), rgb(40, 40, 40))",
    // "@media (prefers-color-scheme: dark)": {
    // 	backgroundColor: "rgb(40, 40, 40)",
    // },
  },
  ".cm-ai-input": {
    display: "block",
    width: "100%",
    padding: "3px 8px",
    border: "2px solid rgb(51, 154, 240)",
    borderRadius: "5px",
    fontSize: "12px",
  },
  ".cm-ai-help-info": {
    fontSize: "10px",
    paddingLeft: "10px",
    height: "18px",
    color: "light-dark(rgb(109, 117, 125), rgb(170, 170, 170))",
    display: "block",
    marginRight: "auto",
    // "@media (prefers-color-scheme: dark)": {
    // 	color: "rgb(170, 170, 170)",
    // },
  },
  ".cm-ai-help-info:hover": {
    color: "light-dark(rgb(89, 97, 105), rgb(190, 190, 190))",
  },
  ".cm-ai-generate-btn": {
    background: "#0E639C",
    border: "none",
    padding: "2px 6px",
    color: "#ffffff",
    cursor: "pointer",
    font: "inherit",
    borderRadius: "4px",
    "&:hover": {
      backgroundColor: "#1177bb",
    },
  },
  ".cm-line.cm-ai-selection, .cm-line.cm-ai-selection.cm-active-line": {
    backgroundColor:
      "light-dark(color-mix(in srgb, rgb(223, 227, 232) 50%, transparent), color-mix(in srgb, rgb(50, 50, 50) 50%, transparent)) !important",
    // "@media (prefers-color-scheme: dark)": {
    // 	backgroundColor: "color-mix(in srgb, rgb(50, 50, 50) 50%, transparent) !important",
    // },
  },
  ".cm-line:has(.cm-new-code-line)": {
    backgroundColor:
      "light-dark(color-mix(in srgb, rgb(183, 235, 143) 50%, transparent), color-mix(in srgb, rgb(40, 100, 40) 50%, transparent)) !important",
    // "@media (prefers-color-scheme: dark)": {
    // 	backgroundColor: "color-mix(in srgb, rgb(40, 100, 40) 50%, transparent) !important",
    // },
  },
  ".cm-old-code-container": {
    backgroundColor: "light-dark(rgb(255, 205, 205), rgb(100, 40, 40))",
    position: "relative",
    display: "flex",
    width: "100%",
    alignItems: "center",
    // "@media (prefers-color-scheme: dark)": {
    // 	backgroundColor: "rgb(100, 40, 40)",
    // },
  },
  ".cm-code-button": {
    position: "absolute",
    right: "5px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
  },
  ".cm-floating-buttons": {
    fontFamily: "sans-serif",
    position: "absolute",
    bottom: "0",
    right: "0",
    display: "flex",
  },
  ".cm-floating-button": {
    fontFamily: "sans-serif",
    padding: "2px 5px",
    fontSize: "10px",
    cursor: "pointer",
    fontWeight: "700",
  },
  ".cm-floating-accept": {
    backgroundColor: "light-dark(rgb(55, 125, 34), rgb(40, 80, 25))",
    borderTopLeftRadius: "5px",
    borderBottomLeftRadius: "5px",
    opacity: "0.8",
    color: "white",
    "&:hover": {
      opacity: "1",
    },
  },
  ".cm-floating-reject": {
    backgroundColor: "light-dark(rgb(220, 53, 69), rgb(180, 40, 50))",
    color: "white",
    borderTopRightRadius: "5px",
    opacity: "0.8",
    borderBottomRightRadius: "5px",
    "&:hover": {
      opacity: "1",
    },
  },
  ".hotkey": {
    display: "inline-block",
    padding: "0 4px",
    borderRadius: "3px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    fontSize: "90%",
  },
  ".cm-ai-loading-indicator": {
    fontStyle: "italic",
    fontSize: "10px",
    paddingLeft: "12px",
    color: "light-dark(rgb(109, 117, 125), rgb(170, 170, 170))",
    opacity: "0",
    transition: "opacity 0.3s ease-in-out",
    "&::after": {
      content: '""',
      display: "inline-block",
      animation: "ellipsis-pulse 1.5s steps(4, end) infinite",
    },
    "&:not(:empty)": {
      opacity: "1",
    },
    // "@media (prefers-color-scheme: dark)": {
    // 	color: "rgb(170, 170, 170)",
    // },
  },
  ".cm-ai-input:disabled": {
    opacity: "0.5",
  },
  "@keyframes ellipsis-pulse": {
    "0%": {
      content: "'.'",
    },
    "25%": {
      content: "'..'",
    },
    "50%": {
      content: "'...'",
    },
    "75%": {
      content: "''",
    },
  },
  ".cm-ai-loading-container": {
    display: "flex",
    alignItems: "center",
    padding: "0 8px",
  },
  ".cm-ai-cancel-btn": {
    padding: "2px 8px",
    fontSize: "10px",
    borderRadius: "4px",
    color: "light-dark(rgb(109, 117, 125), rgb(170, 170, 170))",
    cursor: "pointer",
    "&:hover": {
      background: "light-dark(rgb(223, 227, 232), rgb(50, 50, 50))",
    },
  },
  ".hidden": {
    display: "none",
  },
});
