export type VenomProduct = {
  code: string;
  name: string;
  summary: string;
  imageUrl: string | null;
  category: string;
  rarity: string;
  href: string;
};

const HCUNITS_VENOM_SOURCE =
  "https://r.jina.ai/https://hcunits.net/sets/ve/";
const HCUNITS_VENOM_URL = "https://hcunits.net/sets/ve/";
export const VENOM_SET_ICON_URL = "https://storage.googleapis.com/static.hcunits.net/images/set/ve/icon.svg";

function normalizeImageUrl(imageUrl: string | null) {
  if (!imageUrl) {
    return null;
  }

  return imageUrl.replace("_42x42", "");
}

function inferCategory(summary: string, code: string) {
  if (code.startsWith("veM")) return "Map";
  if (code.startsWith("veOS")) return "One-Shot";
  if (code.startsWith("veTM")) return "Terrain";
  if (summary.includes("Equipment")) return "Equipment";
  if (summary.includes("Bystander")) return "Bystander";
  if (summary.includes("Object")) return "Object";
  if (summary.includes("Water")) return "Water";
  return "Figure";
}

function inferRarity(code: string) {
  if (code.startsWith("veL")) return "Legacy";
  if (code.startsWith("veM") || code.startsWith("veOS") || code.startsWith("veTM")) return "Game Element";
  if (code === "ve014b") return "Chase";

  const standardFigure = code.match(/^ve(\d{3})([ab])?$/);

  if (!standardFigure) {
    return "Special";
  }

  const numericCode = Number.parseInt(standardFigure[1], 10);
  const variantSuffix = standardFigure[2] ?? "";

  if (numericCode >= 1 && numericCode <= 16) {
    return "Common";
  }

  if (numericCode >= 17 && numericCode <= 28) {
    return "Uncommon";
  }

  if (numericCode >= 29 && numericCode <= 40) {
    return variantSuffix === "b" ? "Rare Prime" : "Rare";
  }

  if (numericCode >= 41 && numericCode <= 52) {
    return variantSuffix === "b" ? "Super Rare Prime" : "Super Rare";
  }

  if ((numericCode >= 53 && numericCode <= 60) || (numericCode >= 99 && numericCode <= 101)) {
    return "Chase";
  }

  if (numericCode >= 200 && numericCode <= 201) {
    return "Chase Unique";
  }

  return "Special";
}

function parseVenomMarkdown(markdown: string) {
  const start = markdown.indexOf("*   Map and Terrain");

  if (start === -1) {
    throw new Error("No se pudo ubicar el listado de Venom en HCUnits.");
  }

  const relevantLines = markdown
    .slice(start)
    .split("\n")
    .map((line) => line.trim());

  const entries: VenomProduct[] = [];

  for (const line of relevantLines) {
    if (!line) {
      continue;
    }

    if (line.startsWith("![Image") || line === "VENOM") {
      break;
    }

    if (!line.startsWith("*   ")) {
      continue;
    }

    if (line === "*   Map and Terrain") {
      continue;
    }

    const imageMatch = line.match(
      /^\*\s+\[!\[Image[^\]]*\]\(([^)]+)\)\s+(.+?)\]\(https:\/\/hcunits\.net\/sets\/ve\/\)$/,
    );

    const mapMatch = line.match(
      /^\*\s+\[_map_\s+(.+?)\]\(https:\/\/hcunits\.net\/sets\/ve\/\)$/,
    );

    const label = imageMatch?.[2] ?? mapMatch?.[1];
    const imageUrl = normalizeImageUrl(imageMatch?.[1] ?? null);

    if (!label) {
      continue;
    }

    const codeMatch = label.match(/\((ve[A-Za-z0-9]+)\)/);

    if (!codeMatch) {
      continue;
    }

    const code = codeMatch[1];
    const name = label.slice(0, codeMatch.index).trim();
    const summary = label.slice((codeMatch.index ?? 0) + codeMatch[0].length).trim();

    entries.push({
      code,
      name,
      summary,
      imageUrl,
      category: inferCategory(summary, code),
      rarity: inferRarity(code),
      href: HCUNITS_VENOM_URL,
    });
  }

  return entries;
}

export async function getVenomProducts() {
  const response = await fetch(HCUNITS_VENOM_SOURCE, {
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!response.ok) {
    throw new Error(`HCUnits respondió con ${response.status}.`);
  }

  const markdown = await response.text();
  const products = parseVenomMarkdown(markdown);

  if (products.length !== 111) {
    throw new Error(`Se esperaban 111 productos Venom y llegaron ${products.length}.`);
  }

  return products;
}