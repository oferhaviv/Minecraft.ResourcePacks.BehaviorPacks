/**
 * ZipIt – UI form schema.
 * Defines title and sections (label, toggle, dropdown, rule) for the settings form.
 *
 * Alignment: Form order = sections order = formValues[i] for section i.
 * - label:    no path; still occupies formValues[i] (typically undefined).
 * - toggle:   path into settings object (dot-separated).
 * - rule:     per-packing-rule toggle; value resolved from rules override or profile default.
 * - dropdown: path + options; debug.level is stored as "none"/"basic", converted from index.
 *
 * Rules are grouped by profile membership so the form mirrors the Miner/Builder concept.
 */

function formatItemName(itemId) {
  return String(itemId)
    .replace(/^minecraft:/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Returns the display label for a packing rule, e.g. "Coal → Coal Block". */
export function getRuleLabel(rule) {
  const src = (typeof rule?.friendlyName === "string" && rule.friendlyName.trim())
    ? rule.friendlyName.trim()
    : formatItemName(rule?.sourceItem ?? "");
  const tgt = formatItemName(rule?.targetItem ?? "");
  return `${src} → ${tgt}`;
}

/**
 * Resolves the effective enabled state for a rule toggle:
 * explicit per-player override → profile default → rule default.
 */
export function resolveRuleEnabled(settings, rule) {
  const explicit = settings?.rules?.[rule.id]?.enabled;
  if (typeof explicit === "boolean") return explicit;
  const profiles = Array.isArray(rule.profile) ? rule.profile : [];
  if (profiles.length === 0) return rule.enabledByDefault ?? true;
  return profiles.some((p) => settings?.profiles?.[p] === true);
}

/**
 * Builds the full sections array for the settings form.
 * Rules are grouped: Miner-only, Builder-only, Miner & Builder, then ungrouped.
 */
export function buildUiSections(rules, settingsType = "basic") {
  const minerOnly  = rules.filter((r) =>  r.profile?.includes("miner") && !r.profile?.includes("builder"));
  const builderOnly = rules.filter((r) => !r.profile?.includes("miner") &&  r.profile?.includes("builder"));
  const shared      = rules.filter((r) =>  r.profile?.includes("miner") &&  r.profile?.includes("builder"));
  const other       = rules.filter((r) => !r.profile?.length);

  const ruleSection = (rule) => ({
    type: "rule",
    label: getRuleLabel(rule),
    ruleId: rule.id,
    rule,
  });

  const sections = [{ type: "toggle",   label: "Enable ZipIt",    path: "enabled" },];
  if (settingsType === "basic") {
    sections.push({ type: "label",    label: "Profiles" });
    sections.push({ type: "toggle",   label: "Miner",            path: "profiles.miner" });
    sections.push({ type: "toggle",   label: "Builder",          path: "profiles.builder" });
    sections.push({ type: "label",    label: "Features" });
    sections.push({ type: "toggle",   label: "Consolidate Stacks",   path: "features.inventorySort" });
  } else {
    sections.push({ type: "toggle",   label: "Consolidate Stacks",   path: "features.inventorySort" });
    if (minerOnly.length > 0) {
      sections.push({ type: "label", label: "Miner Items" });
      for (const r of minerOnly) sections.push(ruleSection(r));
    }
    if (builderOnly.length > 0) {
      sections.push({ type: "label", label: "Builder Items" });
      for (const r of builderOnly) sections.push(ruleSection(r));
    }
    if (shared.length > 0) {
      sections.push({ type: "label", label: "Miner & Builder Items" });
      for (const r of shared) sections.push(ruleSection(r));
    }
    if (other.length > 0) {
      sections.push({ type: "label", label: "Items" });
      for (const r of other) sections.push(ruleSection(r));
    }
  }

  sections.push({
    type: "dropdown",
    label: "Debug Level",
    path: "debug.level",
    options: ["None", "Basic"],
  });

  return sections;
}
