import messages from "../../../windrecorder/config_src/languages.json"

export const ZH_MESSAGES: Record<string, string> = Object.fromEntries(
  Object.entries(messages).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
)
