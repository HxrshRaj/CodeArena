/**
 * Seed challenges. Challenge authoring has no UI on purpose (see README /
 * scope notes) — these fixtures are the catalogue.
 *
 * Every challenge is stdin -> stdout so the sandbox runner stays
 * language-agnostic and dead simple.
 */
import { PrismaClient, type Difficulty } from "../generated/client/index.js";

const prisma = new PrismaClient();

interface SeedCase {
  name: string;
  stdin: string;
  expectedStdout: string;
  hidden?: boolean;
  weight?: number;
}

interface SeedChallenge {
  slug: string;
  title: string;
  difficulty: Difficulty;
  promptMd: string;
  starterCode: string;
  cases: SeedCase[];
}

const challenges: SeedChallenge[] = [
  {
    slug: "sum-of-list",
    title: "Sum of a List",
    difficulty: "easy",
    promptMd: [
      "## Sum of a List",
      "",
      "**Input**",
      "",
      "- Line 1: an integer `N`.",
      "- Line 2: `N` space-separated integers.",
      "",
      "**Output**",
      "",
      "Print a single integer: the sum of the `N` integers.",
      "",
      "```",
      "3",
      "1 2 3",
      "```",
      "→ `6`",
    ].join("\n"),
    starterCode: [
      "import sys",
      "",
      "def main() -> None:",
      "    data = sys.stdin.read().split()",
      "    n = int(data[0])",
      "    nums = list(map(int, data[1:1 + n]))",
      "    # TODO: print the sum",
      "",
      "main()",
      "",
    ].join("\n"),
    cases: [
      { name: "sample: 1 2 3", stdin: "3\n1 2 3\n", expectedStdout: "6" },
      { name: "sample: single element", stdin: "1\n42\n", expectedStdout: "42" },
      { name: "hidden: negatives", stdin: "4\n-5 5 -10 10\n", expectedStdout: "0", hidden: true },
      { name: "hidden: zero elements", stdin: "0\n\n", expectedStdout: "0", hidden: true },
      {
        name: "hidden: large values",
        stdin: "3\n1000000000 1000000000 1000000000\n",
        expectedStdout: "3000000000",
        hidden: true,
        weight: 2,
      },
    ],
  },
  {
    slug: "fizzbuzz",
    title: "FizzBuzz",
    difficulty: "easy",
    promptMd: [
      "## FizzBuzz",
      "",
      "Read an integer `N`. Print the numbers `1..N`, one per line, except:",
      "",
      "- multiples of 3 → `Fizz`",
      "- multiples of 5 → `Buzz`",
      "- multiples of both → `FizzBuzz`",
    ].join("\n"),
    starterCode: [
      "import sys",
      "",
      "def main() -> None:",
      "    n = int(sys.stdin.readline())",
      "    # TODO",
      "",
      "main()",
      "",
    ].join("\n"),
    cases: [
      { name: "sample: N=5", stdin: "5\n", expectedStdout: "1\n2\nFizz\n4\nBuzz" },
      {
        name: "sample: N=15",
        stdin: "15\n",
        expectedStdout:
          "1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz",
      },
      { name: "hidden: N=1", stdin: "1\n", expectedStdout: "1", hidden: true },
      { name: "hidden: N=3", stdin: "3\n", expectedStdout: "1\n2\nFizz", hidden: true },
    ],
  },
  {
    slug: "most-frequent-word",
    title: "Most Frequent Word",
    difficulty: "medium",
    promptMd: [
      "## Most Frequent Word",
      "",
      "Read one line of text. Words are separated by whitespace. Compare words",
      "case-insensitively and strip surrounding punctuation (`.,!?;:`).",
      "",
      "Print the most frequent word (lowercased). Break ties alphabetically.",
      "",
      "```",
      "The cat sat on the mat. The cat purred.",
      "```",
      "→ `the`",
    ].join("\n"),
    starterCode: [
      "import sys",
      "",
      "def main() -> None:",
      "    line = sys.stdin.readline()",
      "    # TODO",
      "",
      "main()",
      "",
    ].join("\n"),
    cases: [
      {
        name: "sample: cats",
        stdin: "The cat sat on the mat. The cat purred.\n",
        expectedStdout: "the",
      },
      { name: "sample: tie -> alphabetical", stdin: "b a b a\n", expectedStdout: "a" },
      {
        name: "hidden: punctuation",
        stdin: "Wow! Wow, wow. Amazing?\n",
        expectedStdout: "wow",
        hidden: true,
      },
      {
        name: "hidden: single word",
        stdin: "solitude\n",
        expectedStdout: "solitude",
        hidden: true,
      },
      {
        name: "hidden: mixed case",
        stdin: "Go GO go Stop stop\n",
        expectedStdout: "go",
        hidden: true,
        weight: 2,
      },
    ],
  },
  {
    slug: "balanced-brackets",
    title: "Balanced Brackets",
    difficulty: "medium",
    promptMd: [
      "## Balanced Brackets",
      "",
      "Read one line containing only the characters `()[]{}`. Print `YES` if the",
      "brackets are correctly balanced and nested, otherwise `NO`.",
    ].join("\n"),
    starterCode: [
      "import sys",
      "",
      "def main() -> None:",
      "    s = sys.stdin.readline().strip()",
      "    # TODO",
      "",
      "main()",
      "",
    ].join("\n"),
    cases: [
      { name: "sample: balanced", stdin: "([]{})\n", expectedStdout: "YES" },
      { name: "sample: crossed", stdin: "([)]\n", expectedStdout: "NO" },
      { name: "hidden: empty", stdin: "\n", expectedStdout: "YES", hidden: true },
      { name: "hidden: unclosed", stdin: "(((\n", expectedStdout: "NO", hidden: true },
      {
        name: "hidden: long balanced",
        stdin: "{[()()]}[]{}\n",
        expectedStdout: "YES",
        hidden: true,
        weight: 2,
      },
    ],
  },
];

async function main(): Promise<void> {
  for (const c of challenges) {
    const challenge = await prisma.challenge.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug,
        title: c.title,
        difficulty: c.difficulty,
        promptMd: c.promptMd,
        starterCode: c.starterCode,
      },
      update: {
        title: c.title,
        difficulty: c.difficulty,
        promptMd: c.promptMd,
        starterCode: c.starterCode,
      },
    });

    // Upsert each case by (challengeId, index) so this stays re-runnable even
    // after submissions exist (a wholesale delete would trip the TestResult ->
    // TestCase foreign key).
    for (const [index, tc] of c.cases.entries()) {
      const data = {
        name: tc.name,
        stdin: tc.stdin,
        expectedStdout: tc.expectedStdout,
        hidden: tc.hidden ?? false,
        weight: tc.weight ?? 1,
      };
      await prisma.testCase.upsert({
        where: { challengeId_index: { challengeId: challenge.id, index } },
        create: { challengeId: challenge.id, index, ...data },
        update: data,
      });
    }
    // Drop only now-removed trailing cases that nothing references yet.
    await prisma.testCase.deleteMany({
      where: {
        challengeId: challenge.id,
        index: { gte: c.cases.length },
        results: { none: {} },
      },
    });

    console.log(`seeded ${c.slug} (${c.cases.length} cases)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
