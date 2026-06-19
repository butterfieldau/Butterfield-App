/**
 * Seed starter vault recipes with ingredients and costs.
 * Run: pnpm --filter @workspace/scripts run seed-vault
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING so existing rows are preserved.
 */
import { db, vaultRecipesTable, vaultIngredientsTable } from '@workspace/db';
import { randomUUID } from 'crypto';

const recipes = [
  {
    id: 'seed-vault-001',
    name: 'Classic Choc Chip',
    category: 'cookies',
    description: 'Our signature chocolate chip cookie — crispy edges, gooey centre.',
    yieldCount: 24,
    yieldUnit: 'cookies',
    prepTimeMin: 20,
    bakeTimeMin: 12,
    notes: 'Chill dough for at least 30 min for best texture. Use high-quality 70% dark chocolate.',
    ingredients: [
      { name: 'Plain flour',        quantity: '280', unit: 'g',    costCentsPerUnit: 15,   supplier: 'Allied Mills' },
      { name: 'Unsalted butter',    quantity: '225', unit: 'g',    costCentsPerUnit: 82,   supplier: 'Westgold' },
      { name: 'Brown sugar',        quantity: '200', unit: 'g',    costCentsPerUnit: 22,   supplier: null },
      { name: 'Caster sugar',       quantity: '100', unit: 'g',    costCentsPerUnit: 18,   supplier: null },
      { name: 'Eggs',               quantity: '2',   unit: 'ea',   costCentsPerUnit: 60,   supplier: null },
      { name: 'Vanilla extract',    quantity: '2',   unit: 'tsp',  costCentsPerUnit: 45,   supplier: 'Queen Fine Foods' },
      { name: 'Baking soda',        quantity: '1',   unit: 'tsp',  costCentsPerUnit: 8,    supplier: null },
      { name: 'Salt',               quantity: '1',   unit: 'tsp',  costCentsPerUnit: 2,    supplier: null },
      { name: 'Dark chocolate chips', quantity: '340', unit: 'g',  costCentsPerUnit: 210,  supplier: 'Callebaut' },
    ],
  },
  {
    id: 'seed-vault-002',
    name: 'Double Espresso Brownie',
    category: 'desserts',
    description: 'Fudgy chocolate brownie with a double shot of espresso for depth.',
    yieldCount: 16,
    yieldUnit: 'slices',
    prepTimeMin: 15,
    bakeTimeMin: 25,
    notes: 'Do not overbake — toothpick should come out with moist crumbs. Rest 2 hours before cutting.',
    ingredients: [
      { name: 'Dark chocolate 70%', quantity: '200', unit: 'g',      costCentsPerUnit: 320,  supplier: 'Callebaut' },
      { name: 'Unsalted butter',    quantity: '150', unit: 'g',      costCentsPerUnit: 82,   supplier: 'Westgold' },
      { name: 'Caster sugar',       quantity: '280', unit: 'g',      costCentsPerUnit: 18,   supplier: null },
      { name: 'Eggs',               quantity: '3',   unit: 'ea',     costCentsPerUnit: 60,   supplier: null },
      { name: 'Espresso shots',     quantity: '2',   unit: 'shots',  costCentsPerUnit: 85,   supplier: null },
      { name: 'Plain flour',        quantity: '80',  unit: 'g',      costCentsPerUnit: 15,   supplier: 'Allied Mills' },
      { name: 'Cocoa powder',       quantity: '30',  unit: 'g',      costCentsPerUnit: 180,  supplier: 'Valrhona' },
      { name: 'Salt',               quantity: '0.5', unit: 'tsp',    costCentsPerUnit: 2,    supplier: null },
    ],
  },
  {
    id: 'seed-vault-003',
    name: 'Sea Salt Caramel Sauce',
    category: 'sauces',
    description: 'Silky caramel sauce used across the menu — drizzled on brownies, affogatos & cookie sandwiches.',
    yieldCount: 500,
    yieldUnit: 'ml',
    prepTimeMin: 5,
    bakeTimeMin: 15,
    notes: 'Watch temperature carefully. Pull at 175°C for firm set, 165°C for drizzleable consistency.',
    ingredients: [
      { name: 'Caster sugar',       quantity: '300', unit: 'g',   costCentsPerUnit: 18,   supplier: null },
      { name: 'Thickened cream',    quantity: '200', unit: 'ml',  costCentsPerUnit: 95,   supplier: 'Bulla' },
      { name: 'Unsalted butter',    quantity: '60',  unit: 'g',   costCentsPerUnit: 82,   supplier: 'Westgold' },
      { name: 'Sea salt flakes',    quantity: '1.5', unit: 'tsp', costCentsPerUnit: 18,   supplier: 'Maldon' },
    ],
  },
  {
    id: 'seed-vault-004',
    name: 'Butterfield Flat White Base',
    category: 'coffee',
    description: 'House espresso blend ratio and milk steaming guide for our signature flat white.',
    yieldCount: 1,
    yieldUnit: 'cup',
    prepTimeMin: 3,
    bakeTimeMin: 0,
    notes: 'Pull at 93°C. Ristretto ratio: 1:1.5. Steam milk to 65°C, silky microfoam. Pour at 45° tilt.',
    ingredients: [
      { name: 'Espresso (double ristretto)', quantity: '30', unit: 'ml',  costCentsPerUnit: 80,  supplier: 'Toby\'s Estate' },
      { name: 'Full cream milk',             quantity: '160', unit: 'ml', costCentsPerUnit: 12,  supplier: 'Norco' },
    ],
  },
  {
    id: 'seed-vault-005',
    name: 'Signature Cookie Sandwich',
    category: 'cookies',
    description: 'Double choc chip cookies sandwiched with vanilla bean cream & caramel.',
    yieldCount: 8,
    yieldUnit: 'sandwiches',
    prepTimeMin: 30,
    bakeTimeMin: 12,
    notes: 'Assembly: pipe 30g cream filling on flat side, drizzle 10g caramel, press second cookie. Wrap tightly.',
    ingredients: [
      { name: 'Classic Choc Chip cookies', quantity: '16',  unit: 'ea',  costCentsPerUnit: 45,  supplier: 'In-house' },
      { name: 'Mascarpone',                quantity: '150', unit: 'g',   costCentsPerUnit: 320, supplier: 'Eureka' },
      { name: 'Thickened cream',           quantity: '80',  unit: 'ml',  costCentsPerUnit: 95,  supplier: 'Bulla' },
      { name: 'Icing sugar',               quantity: '30',  unit: 'g',   costCentsPerUnit: 20,  supplier: null },
      { name: 'Vanilla bean paste',        quantity: '1',   unit: 'tsp', costCentsPerUnit: 120, supplier: 'Queen Fine Foods' },
      { name: 'Sea Salt Caramel Sauce',    quantity: '80',  unit: 'ml',  costCentsPerUnit: 15,  supplier: 'In-house' },
    ],
  },
];

async function main() {
  console.log('Seeding vault recipes...');
  for (const recipe of recipes) {
    const { ingredients, ...recipeData } = recipe;

    await db.insert(vaultRecipesTable).values({
      id: recipeData.id,
      name: recipeData.name,
      category: recipeData.category,
      description: recipeData.description,
      yieldCount: recipeData.yieldCount,
      yieldUnit: recipeData.yieldUnit,
      prepTimeMin: recipeData.prepTimeMin,
      bakeTimeMin: recipeData.bakeTimeMin,
      notes: recipeData.notes,
      status: 'active',
    }).onConflictDoNothing();

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i]!;
      await db.insert(vaultIngredientsTable).values({
        id: `${recipeData.id}-ing-${String(i).padStart(2, '0')}`,
        recipeId: recipeData.id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        costCentsPerUnit: ing.costCentsPerUnit,
        supplier: ing.supplier,
        sortOrder: i,
      }).onConflictDoNothing();
    }

    console.log(`  ✓ ${recipeData.name}`);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
