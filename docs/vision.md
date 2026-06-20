# Vision & Positioning

## The one-liner
**Claril is the architecture & process workbench that understands your models, not just draws them.**

## Who it's for
Solution Architects and Architects who design and govern processes and systems — and the teams who review them (stakeholders, engineers, compliance).

## The problem
Incumbent tools (Camunda Modeler, SAP Signavio, Bizagi, ARIS, Sparx EA, Lucidchart) are either powerful-but-dated or pretty-but-shallow. They give you a canvas; they don't *understand* the logic, can't *advise* on the design, and silo process (BPMN) away from architecture (C4) and interaction (sequence). Their UIs feel like 2012 enterprise software.

## The wedge
A **deterministic logic inspector** — static analysis over the process graph that is *always right* about structural defects (deadlocks, gateway split/join mismatches, unreachable steps, soundness). It needs no AI, builds trust, and is hard to copy. On top of it sits an **AI advisor** for judgment calls — grounded on the inspector's findings and the Asset Catalog, so it reasons over facts, not guesses.

## What makes Claril different
1. **Understands, not just draws** — deterministic inspector + AI advisor.
2. **One workbench, many models** — BPMN + Sequence + C4 in one project, with a shared Asset Catalog.
3. **AI that's optional and yours** — brand-agnostic, BYOK, local-model capable; the tool is complete without it.
4. **Beautiful** — Linear-minimal, dark-first, canvas-maximal; the diagram itself is themed, not default bpmn.io.
5. **Open and self-hostable** — AGPL-3.0, runs in your infra, no lock-in.

## The moat
EA repository + multi-notation diagramming + AI grounding, together. Sparx has a repository but no AI; Lucidchart has shapes but no CMDB; Structurizr has model-as-code but no custom asset library + AI. Claril has all three.

## Business model
Open-source core under **AGPL-3.0** (copyleft protects against a cloud provider reselling it). A future hosted edition and/or enterprise features (SSO/SCIM, central governance) can layer on via open-core; keep a CLA option open.
