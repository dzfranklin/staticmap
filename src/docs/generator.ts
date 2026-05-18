import type {
  Schema,
  CommandSchema,
  ArgSchema,
  ArgSchemaType,
  ArgDefaultType,
} from "../commands/schema.js";
import type { ExampleValue } from "../commands/base.js";

export function generateDocs(schema: Schema): string {
  const byCategory = new Map<string, CommandSchema[]>();
  for (const cmd of schema.commands) {
    const list = byCategory.get(cmd.category) ?? [];
    list.push(cmd);
    byCategory.set(cmd.category, list);
  }

  const categoryOrder = ["style", "global", "feature-modifier", "feature"];
  const sections = [...byCategory.entries()]
    .sort(
      ([a], [b]) =>
        (categoryOrder.indexOf(a) + 1 || Infinity) -
        (categoryOrder.indexOf(b) + 1 || Infinity),
    )
    .map(([category, commands]) => renderSection(category, commands))
    .join("\n");

  return `<header>
<h1>Staticmap</h1>
<a href="https://github.com/dzfranklin/staticmap">GitHub</a>
</header>
<main>
${sections}
</main>`;
}

function renderSection(category: string, commands: CommandSchema[]): string {
  const items = commands.map(renderCommand).join("\n");
  return `<section>
<h2>${escape(category)}</h2>
${items}
</section>`;
}

function renderCommand(cmd: CommandSchema): string {
  const aliases =
    cmd.alt.length > 0
      ? ` <span class="aliases">(${cmd.alt.map(escape).join(", ")})</span>`
      : "";
  const argsTable =
    cmd.args.length > 0 ? renderArgsTable(cmd.args) : "<p>No arguments.</p>";
  const example = renderExample(cmd);
  const exampleHtml = example
    ? `\n<p class="example">Example: <code>${escape(example)}</code></p>`
    : "";
  return `<div>
<h3>${escape(cmd.type)}${aliases}</h3>
${argsTable}${exampleHtml}
</div>`;
}

function renderExample(cmd: CommandSchema): string | null {
  const values = cmd.example ?? defaultExampleValues(cmd);
  if (values === null) return null;
  const parts: string[] = [cmd.type];
  for (const v of values) {
    if (Array.isArray(v)) {
      if (v.length === 0) return null;
      for (const x of v) parts.push(encodeURIComponent(String(x)));
    } else {
      parts.push(encodeURIComponent(String(v)));
    }
  }
  return `/${parts.join(":")}`;
}

function defaultExampleValues(
  cmd: CommandSchema,
): readonly ExampleValue[] | null {
  const result: ExampleValue[] = [];
  for (const arg of cmd.args) {
    if (arg.default === undefined) return null;
    result.push(arg.default as ExampleValue);
  }
  if (result.some((v) => Array.isArray(v) && v.length === 0)) return null;
  return result;
}

function renderArgsTable(args: ArgSchema[]): string {
  const rows = args.map(renderArgRow).join("\n");
  return `<table>
<thead><tr><th>Argument</th><th>Type</th><th>Default</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
}

function renderArgRow(arg: ArgSchema): string {
  const name = arg.rest ? `${escape(arg.name)}…` : escape(arg.name);
  const type = renderArgType(arg.schema);
  const def =
    arg.default !== undefined ? escape(renderDefault(arg.default)) : "";
  return `<tr><td>${name}</td><td>${type}</td><td>${def}</td></tr>`;
}

function renderArgType(schema: ArgSchemaType): string {
  if (schema.type === "enum") {
    return schema.values.map(escape).join(" | ");
  }
  return escape(schema.type);
}

function renderDefault(value: ArgDefaultType): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "";
    } else {
      return `[${value.map(renderDefault).join(", ")}]`;
    }
  }
  return String(value);
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
