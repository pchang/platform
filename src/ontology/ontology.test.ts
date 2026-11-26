// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadOntology, ontologyFiles } from './files';
import { ask, NS, select, type Graph } from './ontology';
import { validateData } from './methods';

let graph: Graph;
beforeAll(() => {
  graph = loadOntology();
});
const q = (query: string) => select(graph.store, query);

describe('ontology files', () => {
  it('parse as Turtle, platform vocabulary first', () => {
    const files = ontologyFiles();
    expect(files[0]).toMatch(/platform\.ttl$/);
    expect(files.length).toBe(8);
    expect(graph.store.size).toBeGreaterThan(1000);
  });

  it('use no blank nodes, except RDF lists', () => {
    const blanks = q(`SELECT DISTINCT ?s WHERE { ?s ?p ?o FILTER(isBlank(?s)) FILTER NOT EXISTS { ?s rdf:first ?f } }`);
    expect(blanks).toEqual([]);
  });

  it('carry a semantic version on every ontology', () => {
    const unversioned = q(`SELECT ?o WHERE { ?o a owl:Ontology FILTER NOT EXISTS { ?o owl:versionInfo ?v } FILTER(?o NOT IN (lsh:prefixes, p:prefixes)) }`);
    expect(unversioned).toEqual([]);
  });
});

describe('terms are documented', () => {
  it('every object type, relationship, state dimension, method, rule and role has a label', () => {
    const missing = q(`SELECT ?t WHERE {
      VALUES ?kind { p:ObjectType p:Relationship p:StateDimension p:Method p:BusinessRule p:Role p:Input p:Domain p:Parameter }
      ?t a ?kind FILTER NOT EXISTS { ?t rdfs:label ?l } }`);
    expect(missing).toEqual([]);
  });

  it('every object type, relationship, state dimension, method, rule and role has a description', () => {
    const missing = q(`SELECT ?t WHERE {
      VALUES ?kind { p:ObjectType p:Relationship p:StateDimension p:Method p:BusinessRule p:Role }
      ?t a ?kind FILTER NOT EXISTS { ?t rdfs:comment ?c } }`);
    expect(missing).toEqual([]);
  });

  it('orders every input and every value, with no gaps or ties', () => {
    for (const parent of ['?m p:input ?x', '?x skos:inScheme ?m']) {
      const groups = q(`SELECT ?m (GROUP_CONCAT(STR(?o); separator=",") AS ?orders) WHERE { ${parent} . ?x p:order ?o } GROUP BY ?m`);
      expect(groups.length).toBeGreaterThan(20);
      for (const { m, orders } of groups) expect(orders.split(',').map(Number).sort((a, b) => a - b), m).toEqual(orders.split(',').map((_, i) => i + 1));
    }
    expect(q(`SELECT ?x WHERE { { ?m p:input ?x } UNION { ?x a skos:Concept } FILTER NOT EXISTS { ?x p:order ?o } }`)).toEqual([]);
  });

  it('every concept has a label and a scheme', () => {
    expect(q(`SELECT ?c WHERE { ?c a skos:Concept FILTER NOT EXISTS { ?c skos:prefLabel ?l ; skos:inScheme ?s } }`)).toEqual([]);
  });
});

describe('model', () => {
  it('gives every object type a node shape', () => {
    expect(q(`SELECT ?t WHERE { ?t a p:ObjectType FILTER NOT EXISTS { ?shape (sh:targetClass|p:describes) ?t } }`)).toEqual([]);
  });

  it('constrains every state dimension to exactly the concepts of its scheme', () => {
    const dims = q(`SELECT ?dim ?type ?scheme WHERE { ?dim a p:StateDimension ; p:dimensionOf ?type ; p:valuesFrom ?scheme }`);
    // The domain's 69 and the platform's own: a change set's status and outcome, an operation's kind, a value's status,
    // a dataset version's status, a data point's kind and status, an agent's status and an agent proposal's status.
    expect(dims.length).toBe(78);
    for (const { dim, type, scheme } of dims) {
      const inScheme = q(`SELECT ?c WHERE { ?c skos:inScheme <${scheme}> }`).map((r) => r.c).sort();
      const allowed = q(`SELECT ?c WHERE { ?shape (sh:targetClass|p:describes) <${type}> ; sh:property ?ps . ?ps sh:path <${dim}> ; sh:in/rdf:rest*/rdf:first ?c }`).map((r) => r.c).sort();
      expect(allowed, dim).toEqual(inScheme);
    }
  });

  it('points every relationship shape at an object type', () => {
    const bad = q(`SELECT ?ps WHERE { ?ps sh:path ?rel . ?rel a p:Relationship . ?ps sh:class ?c FILTER NOT EXISTS { ?c a p:ObjectType } }`);
    expect(bad).toEqual([]);
  });

  it('reads every relationship both ways, in order, with at most one end contained (platform spec 3.1)', () => {
    expect(q(`SELECT ?rel WHERE { ?rel a p:Relationship FILTER NOT EXISTS { ?rel p:inverseLabel ?inverse ; p:order ?order } }`)).toEqual([]);
    expect(q(`SELECT ?rel WHERE { ?rel a p:Relationship ; p:partOf true ; p:hasPart true }`)).toEqual([]);
    // The domain spec's containment: a study's patients, a patient's visits and adverse events, a visit's records, a record's queries;
    // and in Design and Plan (section 3.4), an opportunity's or program's options and study concepts, a parent's scenarios, targets and decisions, a scenario's simulations, a simulation's forecasts,
    // a protocol's design objects, a population's criteria, an objective's estimand and a site selection's proposed sites.
    const partOf = q(`SELECT ?rel WHERE { ?rel p:partOf true FILTER(STRSTARTS(STR(?rel), STR(ls:))) }`).map((r) => r.rel.split('#').pop()).sort();
    expect(partOf).toEqual(['capturedAt', 'contributesTo', 'decidesOn', 'defines', 'enrolledIn', 'estimandOf', 'experiencedBy', 'explores', 'forecastFrom',
      'isAbout', 'measures', 'optionFor', 'proposedFor', 'proposedIn', 'raisedOn', 'resolves', 'simulates', 'specifiedIn', 'targetFor', 'visitFor']);
    // An experiment's results, a program's target product profiles, and a study scenario's budget and site selection.
    expect(q(`SELECT ?rel WHERE { ?rel p:hasPart true }`).map((r) => r.rel.split('#').pop()).sort()).toEqual(['aimsAt', 'produces', 'usesBudget', 'usesSiteSelection']);
  });

  it('says an end holds at most one object only where the domain is certain', () => {
    const one = q(`SELECT ?type ?rel WHERE { ?shape sh:targetClass ?type ; sh:property ?ps . ?ps sh:path ?rel ; sh:maxCount 1 . ?rel a p:Relationship FILTER(STRSTARTS(STR(?type), STR(ls:))) }`);
    expect(one.length).toBe(47);
    expect(one).toContainEqual({ type: `${NS.ls}Patient`, rel: `${NS.ls}enrolledIn` });
    expect(one).not.toContainEqual({ type: `${NS.ls}Study`, rel: `${NS.ls}runsAt` });
  });
});

describe('methods', () => {
  it('apply to object types and have precondition shapes where they have preconditions', () => {
    expect(q(`SELECT ?m WHERE { ?m a p:Method FILTER NOT EXISTS { ?m p:appliesTo ?t . ?t a p:ObjectType } }`)).toEqual([]);
    expect(q(`SELECT ?m WHERE { ?m p:precondition ?s FILTER NOT EXISTS { ?s a sh:NodeShape } }`)).toEqual([]);
  });

  it('give every input a name and exactly one kind', () => {
    const inputs = q(`SELECT ?i (COUNT(?k) AS ?kinds) WHERE {
      ?m p:input ?i . ?i p:inputName ?n .
      OPTIONAL { VALUES ?kp { p:datatype p:valuesFrom p:objectOf p:isActor } ?i ?kp ?k }
    } GROUP BY ?i`);
    expect(inputs.length).toBeGreaterThan(20);
    for (const { i, kinds } of inputs) expect(Number(kinds), i).toBe(1);
  });

  it('set state values that belong to the dimension being set', () => {
    const bad = q(`SELECT ?e WHERE { ?e p:dimension ?d ; p:value ?v . ?d p:valuesFrom ?s FILTER NOT EXISTS { ?v skos:inScheme ?s } }`);
    expect(bad).toEqual([]);
    const fromInput = q(`SELECT ?e WHERE { ?e p:dimension ?d ; p:valueFromInput ?i . ?d p:valuesFrom ?s FILTER NOT EXISTS { ?i p:valuesFrom ?s } }`);
    expect(fromInput).toEqual([]);
  });

  it('set dimensions of the method’s object type, unless the change follows a relationship', () => {
    const bad = q(`SELECT ?e WHERE { ?m p:appliesTo ?t ; p:effect ?e . ?e a p:StateChange ; p:dimension ?d . ?d p:dimensionOf ?dt
      FILTER(?dt != ?t) FILTER NOT EXISTS { ?e p:along ?r } FILTER NOT EXISTS { ?e p:alongInverse ?r } }`);
    expect(bad).toEqual([]);
  });

  it('create objects in states that belong to the new object type', () => {
    const bad = q(`SELECT ?e ?v WHERE { ?e a p:Creation ; p:createsType ?t ; p:initialState ?v .
      FILTER NOT EXISTS { ?d p:dimensionOf ?t ; p:valuesFrom ?s . ?v skos:inScheme ?s } }`);
    expect(bad).toEqual([]);
    expect(q(`SELECT ?e WHERE { ?e a p:Creation ; p:linkedBy ?r FILTER NOT EXISTS { ?r a p:Relationship } }`)).toEqual([]);
  });

  it('link only to their own inputs', () => {
    expect(q(`SELECT ?e WHERE { ?m p:effect ?e . ?e p:toInput ?i FILTER NOT EXISTS { ?m p:input ?i } }`)).toEqual([]);
  });
});

describe('lifecycles (platform spec 5.1)', () => {
  it('order every type’s state dimensions from 1, so each type has one lifecycle', () => {
    const types = q(`SELECT ?t WHERE { ?t a p:ObjectType }`).map((r) => r.t);
    for (const t of types) {
      const orders = q(`SELECT ?o WHERE { ?d p:dimensionOf <${t}> ; p:order ?o } ORDER BY ?o`).map((r) => Number(r.o));
      expect(orders, t).toEqual(orders.map((_, i) => i + 1));
    }
  });

  it('keep each lifecycle to at most five stages, the steps of the chart color ramp', () => {
    const counts = q(`SELECT ?d (COUNT(?v) AS ?n) WHERE { ?d a p:StateDimension ; p:order 1 ; p:valuesFrom ?s . ?v skos:inScheme ?s } GROUP BY ?d`).map((r) => Number(r.n));
    expect(counts.length).toBeGreaterThan(10);
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
  });
});

describe('rules and roles', () => {
  it('number the seven business rules of domain spec section 7', () => {
    expect(q(`SELECT ?n WHERE { ?r a p:BusinessRule ; p:ruleNumber ?n } ORDER BY ?n`).map((r) => r.n)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(q(`SELECT ?m WHERE { ?m p:governedBy ?r FILTER NOT EXISTS { ?r a p:BusinessRule } }`)).toEqual([]);
  });

  it('let roles run only methods that exist', () => {
    expect(q(`SELECT ?m WHERE { ?r p:mayRun ?m FILTER NOT EXISTS { ?m a p:Method } }`)).toEqual([]);
  });

  it('use only NCIt codes checked against the NCI Thesaurus service', () => {
    // Verified on 2026-11-08, the reactions on 2026-11-11, Study Protocol (C70817) on 2026-11-14, the Design and Plan codes on 2026-11-20, and Blood Pressure and its components (C54706, C25298, C25299) on 2026-11-24. Add a code here only after checking its name and definition at the source.
    const verified = ['C2987', 'C3036', 'C3258', 'C34661', 'C37943', 'C39594', 'C84427', 'C15206', 'C15600', 'C15601', 'C15602', 'C16735', 'C16960', 'C25196', 'C41331', 'C41333', 'C41334', 'C41335', 'C41336', 'C41396', 'C42790', 'C49068', 'C49494', 'C49498', 'C53256', 'C53258', 'C53259', 'C70817', 'C70885', 'C85838', 'C191214', 'C221818',
      'C16112', 'C16197', 'C25212', 'C25370', 'C25532', 'C70833', 'C85826', 'C85827', 'C95401', 'C163559', 'C174266', 'C174267', 'C174268', 'C174447', 'C188813', 'C54706', 'C25298', 'C25299'];
    const used = q(`SELECT DISTINCT ?code WHERE { ?s ?match ?code FILTER(STRSTARTS(STR(?code), "http://purl.obolibrary.org/obo/NCIT_")) }`)
      .map((r) => r.code.replace('http://purl.obolibrary.org/obo/NCIT_', ''));
    expect(used.length).toBeGreaterThan(10);
    for (const code of used) expect(verified, code).toContain(code);
  });
});

describe('Home metrics (platform spec 5.1, Home)', () => {
  it('count a type by values of its own state dimensions, and roles watch only metrics', () => {
    expect(q(`SELECT ?m WHERE { ?m a p:Metric FILTER NOT EXISTS { ?m rdfs:label ?l ; rdfs:comment ?c ; p:metricOf ?t . ?t a p:ObjectType } }`)).toEqual([]);
    const strays = q(`SELECT ?m ?v WHERE { ?m a p:Metric ; p:metricOf ?t ; p:inState ?v
      FILTER NOT EXISTS { ?d p:dimensionOf ?t ; p:valuesFrom ?s . ?v skos:inScheme ?s } }`);
    expect(strays).toEqual([]);
    expect(q(`SELECT ?m WHERE { ?m p:pastDue ?p ; p:metricOf ?t FILTER NOT EXISTS { ?shape sh:targetClass ?t ; sh:property ?ps . ?ps sh:path ?p ; sh:datatype xsd:date } }`)).toEqual([]);
    expect(q(`SELECT ?r WHERE { ?r p:watches ?m FILTER NOT EXISTS { ?m a p:Metric } }`)).toEqual([]);
    expect(q(`SELECT ?r WHERE { ?r a p:Role FILTER NOT EXISTS { ?r p:watches ?m } }`)).toEqual([]);
  });
});

describe('agrees with the domain spec', () => {
  const spec = readFileSync(join(import.meta.dirname, '../../spec/domain-life-sciences.md'), 'utf8');
  const tableRows = (heading: string) => {
    const section = spec.split(heading)[1].split('\n### ')[0].split('\n## ')[0];
    return section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---') && !/^\| (Type|Method) \|/.test(l))
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  };
  const typeSections = ['### 2.1 Object types', '### 3.1 Object types', '### 3.5 Design and Plan object types', '### 4.1 Object types'];
  const methodSections = ['### 2.3 Methods', '### 3.3 Methods', '### 3.7 Design and Plan methods', '### 4.3 Methods'];

  it('has every object type, state dimension and state value', () => {
    for (const heading of typeSections) {
      for (const [type, , dims] of tableRows(heading)) {
        expect(ask(graph.store, `ASK { ?t a p:ObjectType ; rdfs:label "${type}" }`), type).toBe(true);
        for (const sentence of dims.split('. ')) {
          const m = sentence.match(/^([A-Z][A-Za-z -]+): ([^.]+)/);
          if (!m) continue;
          const [, dim, values] = m;
          for (const value of values.split(', ').map((v) => v.replace(/\.$/, ''))) {
            const found = ask(graph.store, `ASK { ?t rdfs:label "${type}" . ?d p:dimensionOf ?t ; rdfs:label "${dim}" ; p:valuesFrom ?s . ?c skos:inScheme ?s ; skos:prefLabel "${value}" }`);
            expect(found, `${type} ${dim}: ${value}`).toBe(true);
          }
        }
      }
    }
  });

  it('has every method, on the right object type', () => {
    let count = 0;
    for (const heading of methodSections) {
      for (const [method, on] of tableRows(heading)) {
        count++;
        expect(ask(graph.store, `ASK { ?m a p:Method ; rdfs:label "${method}" ; p:appliesTo ?t . ?t rdfs:label "${on}" }`), `${method} on ${on}`).toBe(true);
      }
    }
    expect(count).toBe(48);
    // The domain's methods; the platform's own, such as a change set's, are in the platform spec (section 3.7).
    expect(q(`SELECT ?m WHERE { ?m a p:Method FILTER(STRSTARTS(STR(?m), STR(ls:))) }`).length).toBe(48);
  });

  it('marks exactly the on-demand methods the To do section lists', () => {
    const line = spec.split('### To do')[1].split('\n').find((l) => l.startsWith('- **On-demand methods**'))!;
    const listed = line.split(': ')[1].replace(/\.$/, '').split(', ').sort();
    const marked = q(`SELECT ?l WHERE { ?m p:onDemand true ; rdfs:label ?l FILTER(STRSTARTS(STR(?m), STR(ls:))) }`).map((r) => r.l).sort();
    expect(marked).toEqual(listed);
  });

  it('gives each role the work domains of its Works mainly in column', () => {
    for (const [persona, works] of tableRows('## 6. Personas').filter((r) => r[0] !== 'Persona')) {
      const domains = q(`SELECT ?l WHERE { ?r rdfs:label "${persona}" ; p:worksIn/rdfs:label ?l }`).map((r) => r.l).sort();
      const named = q(`SELECT ?l WHERE { ?d a p:Domain ; rdfs:label ?l }`).map((r) => r.l).filter((d) => works.includes(d)).sort();
      expect(domains, persona).toEqual(named);
      expect(named.length, persona).toBeGreaterThan(0);
      // The first named is the one it is mainly in (platform spec 3.3).
      const first = [...named].sort((a, b) => works.indexOf(a) - works.indexOf(b))[0];
      expect(q(`SELECT ?l WHERE { ?r rdfs:label "${persona}" ; p:mainlyIn/rdfs:label ?l }`).map((r) => r.l), persona).toEqual([first]);
    }
  });

  it('has a role for every persona in section 6', () => {
    for (const [persona] of tableRows('## 6. Personas').filter((r) => r[0] !== 'Persona')) {
      expect(ask(graph.store, `ASK { ?r a p:Role ; rdfs:label "${persona}" }`), persona).toBe(true);
    }
  });
});

it('accepts the ontology itself as valid data', async () => {
  expect(await validateData(graph)).toEqual([]);
});
