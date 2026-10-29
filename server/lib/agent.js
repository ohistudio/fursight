// A small agent loop on the Responses API. Each turn Muse Spark picks one tool, our code runs it, and the
// result goes back in, until a tool says the run is over ("done") or the turn limit is hit.
// The model decides what to do; the tools hold the checks, so the model can't skip them.
//
//   run({ instructions, input, tools, turns }) -> { result, done, turns, steps }
//   The model may call several tools in one turn: the looks run together, answer/ask_owner go last.
//   tools: { name: { description, parameters, run(args) -> { output, done?, images?, step? } } }
//     output  what the model sees next (refusals come back as { error } so it can fix them)
//     images  data URLs shown to the model right after the result (a pet cam frame, say)
//     step    a line for "how it decided": { tool, label, detail?, kind? }
const { call, SPARK } = require("./meta");

async function run({ instructions, input, tools, turns = 6, effort = "low" }) {
  const defs = Object.entries(tools).map(([name, t]) => ({ type: "function", name, description: t.description, parameters: t.parameters }));
  const messages = [...input], steps = [];
  for (let turn = 1; turn <= turns; turn++) {
    if (turn === turns) messages.push(user("This is your last turn: call answer now with what you have."));
    const out = await call("/responses", {
      model: SPARK, instructions, input: messages, tools: defs,
      store: false, reasoning: { effort }, max_output_tokens: 3000,
    });
    messages.push(...out.output);
    const calls = out.output.filter((o) => o.type === "function_call");
    if (!calls.length) { messages.push(user("Call a tool: answer when you're ready.")); continue; }
    // several looks in one turn run together; answer and ask_owner are taken last
    calls.sort((a, b) => (FINAL.has(a.name) ? 1 : 0) - (FINAL.has(b.name) ? 1 : 0));
    const results = await Promise.all(calls.filter((c) => !FINAL.has(c.name)).map((c) => use(tools, c)));
    for (const c of calls.filter((c) => FINAL.has(c.name))) results.push(await use(tools, c));
    let finished = null;
    const pictures = [];
    calls.forEach((c, i) => {
      const r = results[i];
      if (r.step) steps.push(r.step);
      messages.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(r.output) });
      if (r.images && r.images.length) pictures.push({ type: "input_text", text: r.imageNote || "The picture:" }, ...r.images.map((u) => ({ type: "input_image", image_url: u })));
      if (r.done && !finished) finished = r;
    });
    if (pictures.length) messages.push({ role: "user", content: pictures });
    if (finished) return { result: finished.output, done: finished.done, turns: turn, steps };
  }
  return { result: null, done: "out_of_turns", turns, steps };
}

const FINAL = new Set(["answer", "ask_owner"]);
async function use(tools, c) {
  const tool = tools[c.name];
  let args = {};
  try { args = JSON.parse(c.arguments || "{}"); } catch {}
  return tool ? tool.run(args) : { output: { error: "no such tool: " + c.name } };
}

const user = (text) => ({ role: "user", content: [{ type: "input_text", text }] });

module.exports = { run, user };
