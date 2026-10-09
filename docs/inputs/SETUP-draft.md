# RivetRun — Hackathon Setup & AI Development Workflow

> One human. Four parallel coding agents. One repository. One AI-powered robot racing game.

RivetRun is a mobile-browser robot-building and racing game created during a hackathon.

Players assemble robots from maker-inspired components, customize their AI's behavior, and race through terrain challenges. The robots make decisions using Jev, while deterministic simulation rules handle movement, traction, damage, energy, and outcomes.

This document explains how we organized the development process, which AI tools and models we used, how we coordinated parallel coding sessions, and what we learned.

It also records the mistakes. Not everything went according to plan.

---

## 1. Summary

### The challenge

Build a playable, visually engaging, AI-native browser game during a single hackathon.

The project was developed by **one human developer**, coordinating multiple AI coding sessions.

Our approach combined:

- Specification-first development.
- Four parallel Claude Code sessions.
- Explicit file ownership.
- Shared Zod contracts.
- A deterministic simulation engine.
- Jev as the robot's decision-making model.
- Automated comparisons against baseline policies.
- Real-world maker hardware and terrain references.
- Mobile-first gameplay and multiplayer racing.

### Development setup

| Dimension | Setup |
|---|---|
| Human developers | 1 |
| Coding environment | Claude Code |
| Coding model | Claude Opus 5.5 |
| Parallel coding sessions | 4 |
| Repository | Single shared repository |
| Development mode | FAST MODE |
| Branch strategy | All sessions on `main` |
| Coordination | Path ownership |
| Shared contracts | Zod |
| Simulation | Deterministic 1D side-view |
| Frontend | Next.js + React Three Fiber |
| In-game AI | Jev `jev-1.13.0` |
| Jev interface | TypeSafe |
| AI policies | `jev`, `heuristic`, `random` |
| Multiplayer | Room Race over Server-Sent Events |
| Research assistance | ChatGPT |
| Design assistance | Claude Design |

The goal was not to maximize architectural complexity.

The goal was to turn a specification into a playable experience as quickly as possible.

---

## 2. Agents and Roles

We used four parallel Claude Code sessions, each responsible for a distinct area of the same repository.

All four sessions used Claude Opus 5.5.

A separate planning chat was used to prepare specifications, coding prompts, and design mockups.

### Development agents

| Session | Role | Primary responsibility |
|---|---|---|
| `sim` | Simulation Engineer | Deterministic physics, terrain, robot parts, movement, energy, damage |
| `brain` | AI Engineer | Jev integration, decision policies, observations, benchmarks |
| `game` | Gameplay Engineer | Missions, progression, game flow, multiplayer, Room Race |
| `ui` | Interface Engineer | Mobile UI, Garage, HUD, visual presentation, interaction |

### SIM — Simulation Engineer

Responsible for the deterministic simulation.

Core responsibilities:

- Robot configuration.
- Terrain properties.
- Traction and rolling resistance.
- Slopes and obstacles.
- Motor and battery behavior.
- Damage and energy consumption.
- Deterministic state updates.
- Simulation outcomes.

The simulation must produce identical results when given the same configuration, initial state, actions, and deterministic inputs.

**Key principle:** The simulation determines what happens. AI policies determine what actions to take.

### BRAIN — AI Engineer

Responsible for the intelligence controlling each robot.

Core responsibilities:

- Jev `jev-1.13.0` integration.
- TypeSafe decision requests.
- Structured robot observations.
- Code-supplied terrain lookahead.
- High-level action selection.
- Heuristic baseline.
- Random baseline.
- Decision telemetry.
- Benchmark execution.

Supported actions:

- `cruise`
- `accelerate`
- `slow_down`
- `brake`
- `reverse`
- `climb_mode`
- `deploy_winch`

The brain does not directly simulate motor physics.

It selects an action from the permitted action set, and the deterministic simulation applies its consequences.

### GAME — Gameplay Engineer

Responsible for turning the simulation into a game.

Core responsibilities:

- Mission loading.
- Race lifecycle.
- Countdown.
- Start and finish conditions.
- Scoring.
- Progression.
- Robot competition.
- Brain Duel.
- Room Race.
- Server-Sent Events.

Room Race uses SSE to distribute race state to connected players.

The objective is a multiplayer experience that remains compatible with the deterministic simulation.

### UI — Interface Engineer

Responsible for the player experience.

Core responsibilities:

- Mobile-first layout.
- Robot Garage.
- Part selection.
- Mission selection.
- Race presentation.
- React Three Fiber rendering.
- Decision HUD.
- Results screens.
- Player feedback.
- Responsive interactions.

The UI should make the AI's decisions understandable without requiring players to know robotics or machine learning.

### Human role

The human developer acted as:

- Product owner.
- Technical coordinator.
- Integration decision-maker.
- Prompt author and reviewer.
- Gameplay tester.
- Scope controller.
- Final demo presenter.

The human did not manually divide every coding task into individual implementation steps.

Instead, each session received a defined responsibility, shared contracts, and a concrete outcome to deliver.

---

## 3. Tools and Models

We used different AI tools for different responsibilities.

### Claude Code — Software development

**Model:** Claude Opus 5.5

Claude Code was responsible for implementation across four parallel sessions.

The sessions worked in the same repository and coordinated through path ownership rather than separate branches.

### Planning chat — Specification and coordination

A separate planning chat prepared the development instructions.

Its responsibilities included:

- Turning the game concept into a technical specification.
- Defining development phases.
- Preparing prompts for the coding sessions.
- Establishing responsibilities.
- Coordinating work across sessions.
- Preparing design instructions.
- Producing Claude Design mockups.

This planning step was intended to reduce ambiguity before implementation.

### Claude Design — Interface mockups

Claude Design was used to prepare visual mockups for the game's interface.

The mockups served as design references for implementation.

They were not a replacement for working UI code.

### ChatGPT — Real-world reference data

ChatGPT was used for research-oriented and content-generation tasks, including:

**Terrain references**

- Asphalt.
- Grass.
- Sand.
- Mud.
- Ice.
- Water.
- Rock.

The work covered friction, rolling resistance, terrain effects, and gameplay balancing.

**Maker hardware references**

Research covered real-world components inspired by Arduino, Raspberry Pi, ESP32, and hobby robotics.

Examples included motors, wheels, tracks, batteries, sensors, cameras, waterproof enclosures, winches, and drone components.

**Sound design**

ChatGPT helped prepare a procedural Web Audio sound module covering engine noise, decisions, acceleration, braking, slipping, crashes, countdowns, and race outcomes.

These contributions provided reference material and implementation inputs.

They should not be interpreted as experimental validation of real-world robot behavior.

### Jev — In-game decision model

**Model:** `jev-1.13.0`  
**Interface:** TypeSafe

Jev is not a coding agent in our development workflow.

Jev is the AI model used inside RivetRun to select robot actions.

The game provides structured observations and an allowed action set.

Jev returns a decision.

That decision is passed to the deterministic simulation.

This distinction is central to the project:

**Claude Code builds the game. Jev plays the game.**

---

## 4. Prompting and Development Approach

### 4.1 Specification first

Before implementation, we prepared a shared technical specification.

The specification defined:

- Product scope.
- Core game loop.
- Technology stack.
- Simulation requirements.
- Component identifiers.
- Terrain identifiers.
- Allowed robot actions.
- AI policy interfaces.
- Shared data contracts.
- Session responsibilities.
- Integration expectations.

The purpose was to give all coding sessions a common source of truth.

### 4.2 Specification marker check

We introduced a marker-based verification step to confirm that each coding session could access the intended specification.

The principle was simple:

**Do not begin implementation until the specification is present and its marker can be found.**

This addressed a real failure during the hackathon.

Initially, the specification did not reach the repository.

Approximately 25 minutes were lost before the problem was identified and corrected.

The marker check was intended to prevent agents from working against missing, outdated, or incomplete instructions.

### 4.3 Zod contracts as the single source of truth

Shared Zod schemas defined the interfaces between development areas.

The contracts covered the structures needed by the simulation, AI policies, and gameplay systems.

The intention was to prevent separate agents from independently inventing incompatible representations of the same entities.

**Rule: Define shared structures once. Consume them everywhere.**

Changes to shared contracts required coordination because multiple sessions depended on them.

### 4.4 FAST MODE

After the initial setup, we adopted a deliberately lightweight coordination strategy.

We called it **FAST MODE**.

Its rules were:

1. All coding sessions work on `main`.
2. Every session has explicit path ownership.
3. Each session commits only the paths it owns.
4. No development gates block implementation.
5. Shared contracts remain authoritative.
6. Integration issues are resolved directly.

The objective was to minimize coordination overhead during a time-limited hackathon.

We intentionally avoided a heavyweight branch and pull-request workflow.

#### Why FAST MODE?

With one human and four AI sessions, traditional development processes can become expensive in terms of coordination time.

The trade-off was explicit:

**Less process overhead in exchange for greater integration risk.**

This approach is specific to a short-lived hackathon environment.

It should not be interpreted as a recommendation to remove code review, automated checks, or release gates from production software.

### 4.5 Path ownership

Each coding session was assigned a distinct implementation area.

The purpose was to reduce conflicting writes while allowing parallel development.

Path ownership controlled which files each session could modify and commit.

Shared contracts were handled as coordination points rather than independently duplicated.

**Important:** Working directly on one branch does not eliminate concurrency problems. FAST MODE reduces process overhead but requires discipline around shared files, commits, and integration.

### 4.6 Prompt structure

We used outcome-oriented prompts rather than broad instructions such as:

> Build the game.

Each implementation prompt specified:

- The agent's responsibility.
- Its owned files or paths.
- The relevant contracts.
- The expected functionality.
- Integration assumptions.
- Constraints it must preserve.
- The expected deliverable.

A representative prompt structure:

```text
ROLE:
You are responsible for [SUBSYSTEM].

CONTEXT:
Read the shared specification and contracts.

OWNERSHIP:
Modify only your assigned paths.

OBJECTIVE:
Deliver [CONCRETE FUNCTIONAL OUTCOME].

CONSTRAINTS:
Preserve shared contracts.
Do not change unrelated subsystems.
Do not introduce unnecessary architecture.

FAST MODE:
Work on main.
Commit only owned paths.
Do not introduce additional development gates.

DONE WHEN:
[OBSERVABLE ACCEPTANCE CRITERIA]
```

This is a representative description of the prompting pattern, not a verbatim transcript of an individual coding session.

---

## 5. Jev Integration and Decision Tuning

### 5.1 The decision model

RivetRun uses a deterministic simulation with high-level AI control.

Jev receives information about the robot and upcoming terrain.

The game supplies lookahead information in code.

Jev does not need to interpret pixels or reconstruct the track from visual input.

Conceptually:

```text
Robot state
    +
Terrain lookahead
    +
Available actions
    |
    v
Jev TypeSafe decision
    |
    v
Selected action
    |
    v
Deterministic simulation
```

### 5.2 Allowed actions

The model selects from the game's fixed action vocabulary:

```text
cruise
accelerate
slow_down
brake
reverse
climb_mode
deploy_winch
```

Actions are interpreted by the simulation according to the robot's equipment and current conditions.

For example, selecting `deploy_winch` does not automatically mean the robot can use a winch.

The robot must have the necessary equipment, and the environment must support the action.

### 5.3 Six-state decision tuning

We tuned the Jev decision question against six test states.

The purpose was to check whether the model selected sensible actions under representative robot and terrain conditions.

The tuning process focused on:

- Providing sufficient observations.
- Keeping the available choices explicit.
- Making the decision question unambiguous.
- Avoiding unnecessary information.
- Checking whether selected actions were appropriate.
- Comparing behavior with baseline policies.

The six exact test states and their outputs should be added to the benchmark record before publication.

**Test-state results:** [TO FILL]

### 5.4 Baseline policies

We implemented three policy types:

| Policy | Description |
|---|---|
| `jev` | Jev selects actions using structured observations |
| `heuristic` | Handwritten deterministic decision rules |
| `random` | Random action selection |

The heuristic policy provides an interpretable baseline.

The random policy helps establish a lower-performance reference.

Jev must demonstrate useful behavior through measured outcomes, not merely through the presence of an AI model.

### 5.5 Benchmark methodology

Policies should be compared under equivalent conditions.

The benchmark should control:

- Robot configuration.
- Mission.
- Terrain seed.
- Initial state.
- Available observations.
- Allowed actions.
- Simulation parameters.

Relevant metrics include:

- Finish rate.
- Completion time.
- Damage.
- Energy remaining.
- Final score.
- Decision latency.
- Invalid-action rate.

Random-policy results require controlled seeds for reproducibility.

The benchmark should distinguish a single successful run from performance across multiple runs.

**No benchmark results are claimed in this document until measurements are added.**

---

## 6. Player-Facing AI: "Brief Your Brain"

One of the central player-facing features is **Brief Your Brain**.

Instead of requiring players to write code, the game allows them to describe how their robot should behave using ordinary language.

For example:

> Be aggressive on asphalt, slow down on ice, and prioritize survival when damage is high.

The intention is to make AI behavior customization accessible to players without robotics or programming experience.

The game remains responsible for defining the actual action vocabulary and simulation rules.

A player's instructions influence the AI's decision-making within those constraints.

This creates an interaction between:

- Hardware selection.
- Player strategy.
- AI decisions.
- Environmental conditions.
- Race outcomes.

The key idea:

**Players build the body and brief the brain.**

---

## 7. Brain Duel and Room Race

### Brain Duel

Brain Duel compares different AI policies.

The objective is to show how different decision strategies affect the same robot's performance.

A meaningful comparison requires equivalent simulation conditions.

The game can compare Jev against heuristic and random baselines.

Visual ghost representations make these comparisons easier to understand during gameplay.

### Room Race

Room Race adds shared multiplayer competition.

Its networking approach uses **Server-Sent Events (SSE)**.

SSE distributes race updates to connected browser clients.

This supports a mobile-browser experience without requiring players to install an application.

The multiplayer presentation and synchronization behavior should be documented from the final implementation.

**Room Race implementation details:** [TO FILL]

---

## 8. Development Timeline

**Start:** Friday, 18:30  
**End:** Saturday, 16:00  
**Total event window:** 21 hours, 30 minutes

The following table is a publication template. Only the overall start/end times and the approximately 25-minute specification delivery problem are currently established.

| Time | Activity | Status |
|---|---|---|
| Friday 18:30 | Hackathon begins | Known |
| [TO FILL] | Repository preparation | [TO FILL] |
| [TO FILL] | Specification delivery problem identified | Known issue; timestamp pending |
| [TO FILL] | Specification reaches repository | Approximately 25 minutes lost |
| [TO FILL] | Four Claude Code sessions begin parallel work | [TO FILL] |
| [TO FILL] | Initial scaffolding | [TO FILL] |
| [TO FILL] | First playable simulation | [TO FILL] |
| [TO FILL] | FAST MODE adopted | [TO FILL] |
| [TO FILL] | Jev integration | [TO FILL] |
| [TO FILL] | Six-state Jev tuning | [TO FILL] |
| [TO FILL] | Brain Duel available | [TO FILL] |
| [TO FILL] | Brief Your Brain available | [TO FILL] |
| [TO FILL] | Room Race available | [TO FILL] |
| [TO FILL] | First successful mobile playtest | [TO FILL] |
| [TO FILL] | Final benchmark | [TO FILL] |
| [TO FILL] | Final deployment and demo preparation | [TO FILL] |
| Saturday 16:00 | Hackathon ends | Known |

### Actual development time

The total event window is not equivalent to active development time.

Breaks, setup, debugging, deployment, and presentation preparation should be accounted for separately when reporting productivity.

**Active development hours:** [TO FILL]

---

## 9. Token Usage

Token counts should be collected from the actual Claude Code session records.

Do not estimate them from message counts or elapsed time.

| Session | Model | Input tokens | Output tokens | Total tokens |
|---|---|---:|---:|---:|
| SIM | Claude Opus 5.5 | [TO FILL] | [TO FILL] | [TO FILL] |
| BRAIN | Claude Opus 5.5 | [TO FILL] | [TO FILL] | [TO FILL] |
| GAME | Claude Opus 5.5 | [TO FILL] | [TO FILL] | [TO FILL] |
| UI | Claude Opus 5.5 | [TO FILL] | [TO FILL] | [TO FILL] |
| **Total** | | **[TO FILL]** | **[TO FILL]** | **[TO FILL]** |

Additional metrics:

| Metric | Value |
|---|---|
| Planning-chat token usage | [TO FILL] |
| ChatGPT token usage | [TO FILL] |
| Total Claude Code cost | [TO FILL] |
| Total model API cost | [TO FILL] |
| Total estimated AI development cost | [TO FILL] |

Token totals and API costs should not be treated as interchangeable measurements.

---

## 10. Benchmark Results

**Status:** [TO FILL]

Benchmark results should be recorded only after running the actual policies against the same scenarios.

### Policy comparison

| Metric | Jev | Heuristic | Random |
|---|---:|---:|---:|
| Runs | [TO FILL] | [TO FILL] | [TO FILL] |
| Finish rate | [TO FILL] | [TO FILL] | [TO FILL] |
| Average completion time | [TO FILL] | [TO FILL] | [TO FILL] |
| Average damage | [TO FILL] | [TO FILL] | [TO FILL] |
| Average energy remaining | [TO FILL] | [TO FILL] | [TO FILL] |
| Average score | [TO FILL] | [TO FILL] | [TO FILL] |
| Average decision latency | [TO FILL] | [TO FILL] | [TO FILL] |
| Invalid-action rate | [TO FILL] | [TO FILL] | [TO FILL] |

### Benchmark configuration

| Parameter | Value |
|---|---|
| Mission(s) | [TO FILL] |
| Robot configuration(s) | [TO FILL] |
| Simulation seed(s) | [TO FILL] |
| Number of repetitions | [TO FILL] |
| Jev model | `jev-1.13.0` |
| Jev interface | TypeSafe |
| Hardware/runtime environment | [TO FILL] |
| Benchmark implementation reference | [TO FILL] |

### Findings

[TO FILL]

The benchmark should answer:

1. Does Jev outperform the random baseline?
2. Does Jev outperform the heuristic baseline?
3. In which situations does Jev make better decisions?
4. Where does Jev perform worse?
5. Is its decision latency acceptable for gameplay?
6. Does natural-language briefing change outcomes meaningfully?

A negative result is still useful.

The goal is an honest comparison, not a predetermined AI victory.

---

## 11. What Worked

### A. Specializing coding agents

Dividing work into simulation, intelligence, gameplay, and UI provided clear areas of responsibility.

This allowed different development activities to proceed in parallel.

The separation also made it easier to identify which session owned a particular implementation problem.

### B. Specification-first coordination

A shared specification provided common terminology and requirements.

It reduced the need to repeat the product concept independently to every agent.

However, its effectiveness depended on agents actually receiving the document.

### C. Zod as a shared contract layer

Using Zod contracts as the single source of truth gave the different implementation areas a common interface.

This was particularly important when connecting the simulation with decision policies and gameplay systems.

### D. Pragmatic coordination

FAST MODE prioritized implementation speed.

Rather than requiring each change to move through a heavyweight development workflow, sessions operated with explicit path ownership and direct integration.

This made the trade-offs visible and intentional.

### E. Separating game rules from AI decisions

The deterministic simulation and interchangeable policy system made it possible to compare different approaches to robot control.

Jev, heuristic rules, and random decisions could operate within the same game rules.

This also made AI behavior observable rather than merely decorative.

### F. Using AI tools for complementary tasks

Different tools contributed different kinds of work.

Claude Code handled implementation.

The planning chat handled specification and coordination.

Claude Design provided interface references.

ChatGPT helped prepare real-world component and terrain references and procedural sound material.

Jev controlled robots inside the game.

The useful lesson was not that one model could do everything.

It was that clearly separated responsibilities made the tools easier to coordinate.

---

## 12. What Failed

### A. The specification initially did not reach the repository

**Impact:** Approximately 25 minutes lost.

The intended workflow assumed that the coding sessions would have access to the shared specification.

That assumption was initially false.

The document had been prepared, but it was not available where the agents needed it.

This created a preventable coordination failure.

**Lesson:** Preparing context and delivering context are separate steps.

A successful planning session does not prove that implementation agents have received the necessary information.

**Improvement:** Verify the specification marker in the repository before starting parallel development.

### B. Heavy scaffolding before a playable game

The initial setup involved too much scaffolding before producing a playable experience.

This is a common failure mode in AI-assisted development.

Agents can generate large amounts of structured code quickly, making architectural progress appear substantial even when the user cannot yet play anything.

For a hackathon, this is dangerous.

**The first meaningful milestone is a playable game, not an impressive directory structure.**

**Improvement:** Establish a minimal vertical slice before expanding infrastructure or feature breadth.

The smallest useful slice should support:

```text
Select robot
    ↓
Start race
    ↓
Robot moves
    ↓
Reach finish or fail
    ↓
See result
    ↓
Retry
```

Everything else should improve that loop.

### C. Coordination overhead remains real

Four parallel coding sessions do not automatically provide four times the development speed.

They also introduce:

- Shared-context problems.
- File ownership conflicts.
- Integration dependencies.
- Contract coordination.
- Commit coordination.
- Debugging overhead.

FAST MODE was a response to those constraints, not a way to eliminate them.

### D. AI-generated complexity can obscure progress

Parallel agents can generate substantial amounts of code before integration proves that the pieces work together.

The practical lesson is to measure progress through working gameplay milestones rather than code volume.

---

## 13. Lessons Learned

### 1. Verify the context before parallelizing

The specification must physically exist where implementation agents expect it.

A marker check is cheaper than discovering missing context after substantial work.

### 2. Make the game playable before making it complete

For a hackathon, the first playable version should precede architectural expansion.

### 3. Use shared contracts to protect parallel development

Parallel agents need stable boundaries.

A single source of truth for shared data is more useful than four independent implementations.

### 4. Give agents explicit ownership

Clear responsibilities reduce accidental overlap.

### 5. Keep AI behavior measurable

If a game claims that AI makes meaningful decisions, compare it with non-AI alternatives.

### 6. Make the AI visible to players

Showing observations, decisions, and consequences makes the AI understandable.

### 7. Preserve the fun

Technical sophistication is not a substitute for enjoyable gameplay.

Players should be able to understand the objective, start a race, and see meaningful results without reading technical documentation.

---

## 14. Reproducibility and Transparency

RivetRun distinguishes between:

**Development AI**

Claude Code and other assistant tools used to build the application.

**Runtime AI**

Jev, which selects actions for robots during gameplay.

**Deterministic systems**

The simulation logic that applies actions and produces outcomes.

**Reference data**

Maker hardware information, terrain estimates, and gameplay parameters.

These categories should not be conflated.

Using an AI model during software development does not make every feature AI-powered.

Similarly, hardware-inspired gameplay values are not automatically validated physical measurements.

Benchmark claims should be supported by recorded runs, configurations, and results.

### Reproduction checklist

Before publication, complete the following:

- [ ] Link the public repository.
- [ ] Record the final commit hash.
- [ ] Record the deployed game URL.
- [ ] Confirm the exact Jev model and configuration.
- [ ] Record the six decision-tuning states.
- [ ] Publish benchmark conditions.
- [ ] Publish benchmark results.
- [ ] Fill in token usage.
- [ ] Fill in actual development milestones.
- [ ] Verify final mobile-browser behavior.
- [ ] Document any incomplete features accurately.

---

# 15. Judge Demo — 60-Second Phone Handoff

This is the intended live demo script.

The presenter should adapt it to the features actually working in the final build.

### 0–10 seconds — Hand over the phone

**Presenter:**

"This is RivetRun. You build a robot, give it an AI brain, and race it through dangerous terrain."

Hand the phone to the judge.

"Go ahead. Pick your robot."

### 10–20 seconds — Build

**Presenter:**

"Every component matters. Wheels are fast, tracks handle mud, and your equipment changes what the robot can survive."

Let the judge make a selection.

### 20–30 seconds — Brief the brain

**Presenter:**

"Now tell your robot how to behave. No programming required."

Point to **Brief Your Brain**.

"Try something like: be fast, but don't take stupid risks."

### 30–45 seconds — Race

Start the race.

**Presenter:**

"Now watch the brain. That's Jev making decisions from the robot's state and the terrain ahead."

Point to the decision HUD.

"The physics are deterministic. The AI chooses what to do."

### 45–55 seconds — Brain Duel

**Presenter:**

"And here's the interesting part: we can race that same robot with a different brain."

Show Brain Duel.

"Same hardware. Same track. Different decisions."

### 55–60 seconds — Close

**Presenter:**

"One developer, four parallel AI coding sessions, and Jev driving the robots."

Pause.

"Now try to beat it."

---

## Final Principle

> **Build the body. Brief the brain. Race the result.**

RivetRun is an experiment in combining accessible robot-building gameplay, structured AI decision-making, and rapid AI-assisted software development.

The hackathon is the starting point.

The larger question is whether a game can make experimenting with intelligent robots entertaining, accessible, and measurable.
