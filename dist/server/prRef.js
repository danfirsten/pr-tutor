const NAME = "[A-Za-z0-9_.-]+";
const URL_REF = new RegExp(`^https?://github\\.com/(${NAME})/(${NAME})/pull/(\\d+)(?:[/?#].*)?$`);
const SHORT_REF = new RegExp(`^(${NAME})/(${NAME})#(\\d+)$`);
export function parsePrRef(input) {
    const match = URL_REF.exec(input.trim()) ?? SHORT_REF.exec(input.trim());
    if (!match)
        return null;
    const number = Number(match[3]);
    if (number < 1)
        return null;
    return { owner: match[1], repo: match[2], number };
}
