/* English grammar contents.

   How to edit:
   - An area is { id, title, lessons }. The id is part of the address (/grammar/<id>): keep it lowercase, with hyphens.
   - A lesson is ["id", "Title"]. The id is part of the address too (lowercase, underscores) and must be unique.
     Optional: a level and a one-line summary, ["id", "Title", "A2", "What it is about."].
   - Lessons that belong together go in a subsection: { sub: "Relative clauses", lessons: [ ...lessons ] }.
     If the subsection itself is also a lesson, give it an id: { sub: "Passive", id: "passive", lessons: [...] }.
   - PARTS are the big headings on the Grammar page; each lists area ids in order.
   Lesson texts are not written yet: every lesson page shows "This lesson is being written". */

export const AREAS = [
  { id: "present-and-past", title: "Present and past", lessons: [
    ["present_continuous", "Present continuous (I am doing)"],
    ["present_simple", "Present simple (I do)"],
    ["present_cont_simple", "Present continuous and present simple (I am doing and I do)"],
    ["past_simple", "Past simple (I did)"],
    ["past_continuous", "Past continuous (I was doing)"],
  ] },
  { id: "present-perfect-and-past", title: "Present perfect and past", lessons: [
    ["present_perfect", "Present perfect (I have done)"],
    ["present_perfect_continuous", "Present perfect continuous (I have been doing)"],
    ["pp_cont_simple", "Present perfect continuous and simple (I have been doing and I have done)"],
    ["how_long", "how long have you (been) … ?"],
    ["for_since", "for and since, when … ? and how long … ?"],
    ["pp_past", "Present perfect and past (I have done and I did)"],
    ["past_perfect", "Past perfect (I had done)"],
    ["past_perfect_continuous", "Past perfect continuous (I had been doing)"],
    ["have_have_got", "have and have got"],
    ["used_to", "used to (do)"],
  ] },
  { id: "future", title: "Future", lessons: [
    ["present_for_future", "Present tenses (I am doing / I do) for the future"],
    ["going_to", "I’m going to (do)"],
    ["will_shall", "will and shall"],
    ["will_going_to", "I will and I’m going to"],
    ["will_be_doing", "will be doing and will have done"],
    ["when_if", "when I do and when I’ve done, if and when"],
  ] },
  { id: "modals", title: "Modals", lessons: [
    ["can_could_able", "can, could and (be) able to"],
    ["could_could_have", "could (do) and could have (done)"],
    ["must_cant", "must and can’t"],
    ["may_might", "may and might"],
    ["have_to_must", "have to and must"],
    ["must_mustnt_neednt", "must, mustn’t, needn’t"],
    ["should", "should"],
    ["had_better", "I’d better …, it’s time …"],
    ["would", "would"],
    ["requests", "can/could/would you … ? etc. (requests, offers, permission and invitations)"],
  ] },
  { id: "if-and-wish", title: "if and wish", lessons: [
    ["if_do_did", "if I do … and if I did …"],
    ["if_knew", "if I knew …, I wish I knew …"],
    ["if_had_known", "if I had known …, I wish I had known …"],
    ["wish", "wish"],
  ] },
  { id: "passive", title: "Passive", lessons: [
    { sub: "Passive", id: "passive", lessons: [
      ["passive_is_was", "is done / was done"],
      ["passive_be_been", "be done / been done / being done"],
    ] },
    ["passive_said", "it is said that …, he is said to …, he is supposed to …"],
    ["have_done", "have something done"],
  ] },
  { id: "reported-speech", title: "Reported speech", lessons: [
    ["reported_speech", "Reported speech (he said that …)"],
  ] },
  { id: "questions", title: "Questions and auxiliary verbs", lessons: [
    { sub: "Questions", id: "questions", lessons: [
      ["questions_indirect", "do you know where … ? / he asked me where …"],
    ] },
    ["auxiliary_verbs", "Auxiliary verbs (have/do/can etc.), I think so / I hope so etc."],
    ["question_tags", "Question tags (do you? isn’t it? etc.)"],
  ] },
  { id: "ing-and-to", title: "-ing and to …", lessons: [
    ["verb_ing", "Verb + -ing (enjoy doing, avoid doing etc.)"],
    ["verb_to", "Verb + to … (decide to …, hope to … etc.)"],
    ["verb_object_to", "Verb (+ object) + to … (I want you to …)"],
    { sub: "Verb + -ing or to …", lessons: [
      ["ing_or_to_remember", "remember, regret etc."],
      ["ing_or_to_try", "try, need, help"],
      ["ing_or_to_like", "like / would like etc."],
    ] },
    ["prefer_rather", "prefer and would rather"],
    ["preposition_ing", "Preposition (in/for/about etc.) + -ing"],
    ["used_to_doing", "be/get used to … (I’m used to …)"],
    ["verb_prep_ing", "Verb + preposition + -ing (insist on -ing, think about -ing etc.)"],
    ["no_point", "there’s no point in -ing, it’s worth -ing etc."],
    ["to_for_so_that", "to …, for … and so that …"],
    ["adjective_to", "Adjective + to …"],
    ["afraid_to_of", "to … (afraid to do) and preposition + -ing (afraid of -ing)"],
    ["see_do_doing", "see somebody do and see somebody doing"],
    ["ing_clauses", "-ing clauses"],
  ] },
  { id: "phrasal-verbs", title: "Phrasal verbs", lessons: [
    { sub: "Phrasal verbs", lessons: [
      ["phrasal_intro", "Introduction"],
      ["phrasal_in_out", "in/out"],
      ["phrasal_out", "out"],
      ["phrasal_on_off", "on/off"],
      ["phrasal_up_down", "up/down"],
      ["phrasal_up", "up"],
      ["phrasal_away_back", "away/back"],
    ] },
  ] },
  { id: "articles-and-nouns", title: "Articles and nouns", lessons: [
    ["countable", "Countable and uncountable"],
    ["countable_a_some", "Countable nouns with a/an and some"],
    ["a_the", "a/an and the"],
    { sub: "the", id: "the", lessons: [
      ["the_school", "school / the school etc."],
      ["the_children", "children / the children"],
      ["the_general", "the tiger / the internet / the rich etc."],
    ] },
    ["names_the", "Names with and without the"],
    ["singular_plural", "Singular and plural"],
    ["noun_noun", "Noun + noun (a tennis ball / a toothache)"],
    ["possessive_of", "-’s (my brother’s car) and of … (the end of the film)"],
  ] },
  { id: "pronouns-and-determiners", title: "Pronouns and determiners", lessons: [
    ["reflexive", "myself/yourself/themselves etc."],
    ["of_mine_own", "a friend of mine, my own house, on my own / by myself"],
    ["there_it", "there … and it …"],
    ["some_any", "some and any"],
    ["no_none", "no/none/any, nothing/nobody etc."],
    ["much_many", "much, many, little, few, a lot, plenty"],
    ["all_most_none", "all / all of, most / most of, no / none of etc."],
    ["both_neither", "both / both of, neither / neither of, either / either of"],
    ["all_every_whole", "all, every, whole"],
    ["each_every", "each and every"],
  ] },
  { id: "relative-clauses", title: "Relative clauses", lessons: [
    { sub: "Relative clauses", lessons: [
      ["rel_who", "clauses with who/that/which"],
      ["rel_omit", "clauses with and without who/that/which"],
      ["rel_whose", "whose/whom/where"],
      ["rel_extra", "extra information clauses"],
    ] },
    ["ing_ed_clauses", "-ing and -ed clauses"],
  ] },
  { id: "adjectives-and-adverbs", title: "Adjectives and adverbs", lessons: [
    ["adj_ing_ed", "Adjectives ending in -ing and -ed (interesting/interested etc.)"],
    ["adj_order", "Adjectives: word order, and after look, feel etc."],
    { sub: "Adjectives and adverbs", lessons: [
      ["adv_quick", "quick/quickly"],
      ["adv_well", "well, fast, late, hard/hardly"],
    ] },
    ["so_such", "so and such"],
    ["enough_too", "enough and too"],
    ["quite_pretty", "quite, pretty, rather and fairly"],
    { sub: "Comparative", lessons: [
      ["comp_er", "older, more interesting etc."],
      ["comp_much", "much better / any better etc."],
      ["comp_as", "as … as / than"],
    ] },
    ["superlative", "Superlative (the oldest, the most interesting etc.)"],
    { sub: "Word order", lessons: [
      ["order_object", "verb + object; place and time"],
      ["order_adverbs", "adverbs with the verb"],
    ] },
    ["still_yet", "still, any more, yet, already"],
    ["even", "even"],
  ] },
  { id: "conjunctions-and-prepositions", title: "Conjunctions and prepositions", lessons: [
    ["although", "although, though, even though, in spite of, despite"],
    ["in_case", "in case"],
    ["unless", "unless, as long as, provided"],
    ["as_time", "as (as I was walking … etc.)"],
    ["like_as", "like and as"],
    ["like_as_if", "like, as if"],
    ["during_for_while", "during, for, while"],
    ["by_until", "by and until, by the time …"],
  ] },
  { id: "prepositions", title: "Prepositions", lessons: [
    ["at_on_in_time", "at/on/in (time)"],
    ["on_in_time", "on time and in time, at the end and in the end"],
    ["in_at_on_position", "in/at/on (position)"],
    ["to_at_in_into", "to, at, in and into"],
    ["in_on_at_other", "in/on/at (other uses)"],
    ["by", "by"],
    ["noun_prep", "Noun + preposition (a reason for, an answer to etc.)"],
    ["adj_prep", "Adjective + preposition"],
    { sub: "Verb + preposition", lessons: [
      ["vp_to_at", "to and at"],
      ["vp_about_for", "about/for/of/after"],
      ["vp_about_of", "about and of"],
      ["vp_of_for", "of/for/from/on"],
      ["vp_in_into", "in/into/with/to/on"],
    ] },
  ] },
  { id: "appendices", title: "Appendices", lessons: [
    ["app_verbs", "Regular and irregular verbs"],
    ["app_tenses", "Present and past tenses"],
    ["app_future", "The future"],
    ["app_modals", "Modal verbs (can/could/will/would etc.)"],
    ["app_short", "Short forms (I’m / you’ve / didn’t etc.)"],
    ["app_spelling", "Spelling"],
    ["app_american", "American English"],
  ] },
];

/* The big headings on the Grammar page. An area left out of every part is shown at the end of the last part. */
export const PARTS = [
  { id: "verbs", title: "Verbs", cats: ["present-and-past", "present-perfect-and-past", "future", "modals", "if-and-wish", "passive", "reported-speech", "questions", "ing-and-to", "phrasal-verbs"] },
  { id: "words", title: "Words and sentences", cats: ["articles-and-nouns", "pronouns-and-determiners", "relative-clauses", "adjectives-and-adverbs", "conjunctions-and-prepositions", "prepositions"] },
  { id: "reference", title: "Reference", cats: ["appendices"] },
];

/* Grammar notes in episodes use older topic ids. They point to these lessons (or, with a leading /, to an area).
   An id that is not here and not a lesson shows in the episode as plain text, without a link. */
const ALIASES = {
  present_perfect_cont: "present_perfect_continuous", future_forms: "will_going_to",
  modals_obligation: "have_to_must", modals_advice: "should", modals_deduction: "must_cant", modals_past: "could_could_have",
  conditionals_1: "if_do_did", conditionals_2: "if_knew", conditionals_3: "if_had_known", would_rather: "prefer_rather",
  causative: "have_done", gerund_infinitive: "/grammar/ing-and-to", relative_clauses: "rel_who", question_forms: "questions",
  comparatives: "comp_er", articles: "a_the", pronouns: "reflexive", subject_verb: "singular_plural",
  participle_clauses: "ing_clauses", conjunctions: "/grammar/conjunctions-and-prepositions", phrasal_verbs: "/grammar/phrasal-verbs",
  polite_requests: "requests", aux_do: "auxiliary_verbs", sense_verbs: "adj_order", prepositions: "/grammar/prepositions", purpose: "to_for_so_that",
};

/* ---------- derived lists, used by grammar.js (no need to edit below) ---------- */
export const CATEGORIES = AREAS.map(a => ({ id: a.id, title: a.title, blurb: a.blurb || "" }));

/* Every lesson in order, as {cat, id, title, sub, lv, sum, head}. head: the subsection's own lesson. */
export const TOPICS = AREAS.flatMap(a => a.lessons.flatMap(item => {
  const one = ([id, title, lv = "", sum = ""], sub = "") => ({ cat: a.id, id, title, sub, lv, sum, head: false });
  if (Array.isArray(item)) return [one(item)];
  const head = item.id ? [{ cat: a.id, id: item.id, title: item.sub, sub: item.sub, lv: item.lv || "", sum: item.sum || "", head: true }] : [];
  return [...head, ...item.lessons.map(l => one(l, item.sub))];
}));

export const topicPath = id => {
  const to = ALIASES[id] || id;
  if (to.startsWith("/")) return to;
  const t = TOPICS.find(x => x.id === to);
  return t ? "/grammar/" + t.cat + "/" + t.id : null;
};
