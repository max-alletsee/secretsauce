<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useUserStore } from '@/stores/useUserStore'
import ToggleChip from '@/components/base/ToggleChip.vue'
import TagInput from '@/components/base/TagInput.vue'

const userStore = useUserStore()

const displayName = ref('')
const preferredUnits = ref<'metric' | 'imperial'>('metric')
const defaultServings = ref(2)
const mealPlanSystemPrompt = ref('')
const mealPlanMealTypes = ref<string[]>(['dinner'])
const mealPlanDaysAhead = ref(7)

// Pre-built tag lists (mirrors backend/app/core/constants.py). Only the
// categories that actually describe a dietary restriction are combined here —
// season/meal-type/cuisine tags do NOT belong in "dietary restrictions".
const PROTEIN_TAGS = ['vegan', 'vegetarian', 'fish', 'poultry', 'meat', 'seafood']
const DIET_TAGS = [
  'low-calorie', 'high-calorie', 'low-carb', 'high-protein',
  'gluten-free', 'dairy-free', 'keto', 'paleo', 'mediterranean',
]
const CUISINE_TAGS = [
  'italian', 'mexican', 'japanese', 'chinese', 'indian',
  'thai', 'french', 'greek', 'middle-eastern', 'american', 'korean',
]

const dietaryRestrictions = ref<string[]>([])
const allergies = ref<string[]>([])
const favoriteCuisines = ref<string[]>([])
const dislikedIngredients = ref<string[]>([])

function withToggledTag(list: string[], tag: string): string[] {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]
}

function toggleDietaryRestriction(tag: string) {
  dietaryRestrictions.value = withToggledTag(dietaryRestrictions.value, tag)
}

function toggleFavoriteCuisine(tag: string) {
  favoriteCuisines.value = withToggledTag(favoriteCuisines.value, tag)
}

function dedupeTrimmed(list: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of list) {
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    result.push(trimmed)
  }
  return result
}

watch(
  () => userStore.user,
  (u) => {
    if (!u) return
    dietaryRestrictions.value = [...(u.dietary_restrictions ?? [])]
    allergies.value = [...(u.allergies ?? [])]
    favoriteCuisines.value = [...(u.favorite_cuisines ?? [])]
    dislikedIngredients.value = [...(u.disliked_ingredients ?? [])]
  },
  { immediate: true },
)

const saving = ref(false)
const saved = ref(false)
const error = ref('')

const ALL_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

function toggleMealType(mt: string) {
  if (mealPlanMealTypes.value.includes(mt)) {
    mealPlanMealTypes.value = mealPlanMealTypes.value.filter((t) => t !== mt)
  } else {
    mealPlanMealTypes.value = [...mealPlanMealTypes.value, mt]
  }
}

onMounted(() => {
  const u = userStore.user
  if (!u) return
  displayName.value = u.display_name ?? ''
  preferredUnits.value = u.preferred_units
  defaultServings.value = u.default_servings
  mealPlanSystemPrompt.value = u.meal_plan_system_prompt ?? ''
  mealPlanMealTypes.value = u.meal_plan_meal_types ?? ['dinner']
  mealPlanDaysAhead.value = u.meal_plan_days_ahead ?? 7
})

async function save() {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    await userStore.updateProfile({
      display_name: displayName.value || null,
      preferred_units: preferredUnits.value,
      default_servings: defaultServings.value,
      meal_plan_system_prompt: mealPlanSystemPrompt.value || null,
      meal_plan_meal_types: mealPlanMealTypes.value,
      meal_plan_days_ahead: mealPlanDaysAhead.value,
      dietary_restrictions: dedupeTrimmed(dietaryRestrictions.value),
      allergies: dedupeTrimmed(allergies.value),
      favorite_cuisines: dedupeTrimmed(favoriteCuisines.value),
      disliked_ingredients: dedupeTrimmed(dislikedIngredients.value),
    })
    saved.value = true
  } catch {
    error.value = 'Failed to save. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="settings-page">
    <h1>Settings</h1>

    <section class="settings-section">
      <h2>Profile</h2>
      <label class="field-label">
        Display name
        <input v-model="displayName" type="text" class="field-input" placeholder="Your name" />
      </label>
      <label class="field-label">
        Preferred units
        <select v-model="preferredUnits" class="field-input">
          <option value="metric">Metric</option>
          <option value="imperial">Imperial</option>
        </select>
      </label>
      <label class="field-label">
        Default servings
        <input v-model.number="defaultServings" type="number" min="1" max="20" class="field-input" />
      </label>
    </section>

    <section class="settings-section">
      <h2>Meal Planning</h2>

      <div class="field-label">
        Meal types to show
        <div class="chip-row">
          <button
            v-for="mt in ALL_MEAL_TYPES"
            :key="mt"
            type="button"
            class="meal-type-chip"
            :class="{ active: mealPlanMealTypes.includes(mt) }"
            @click="toggleMealType(mt)"
          >
            {{ mt }}
          </button>
        </div>
      </div>

      <label class="field-label">
        Days ahead to plan
        <div class="slider-row">
          <input
            v-model.number="mealPlanDaysAhead"
            type="range"
            min="3"
            max="14"
            class="slider"
          />
          <span class="slider-value">{{ mealPlanDaysAhead }} days</span>
        </div>
      </label>

      <label class="field-label">
        Family context &amp; AI instructions
        <textarea
          v-model="mealPlanSystemPrompt"
          class="field-textarea"
          rows="4"
          placeholder="e.g. 2 adults, 1 toddler. We prefer low-spice meals on weekdays."
        />
      </label>
    </section>

    <section class="settings-section">
      <h2>Food preferences</h2>
      <p class="section-hint">These guide AI meal suggestions.</p>

      <div class="field-label" data-testid="pref-dietary_restrictions">
        Dietary restrictions
        <fieldset class="tag-group">
          <legend class="tag-group__legend">Protein</legend>
          <div class="tag-group__chips">
            <ToggleChip
              v-for="tag in PROTEIN_TAGS"
              :key="tag"
              :label="tag"
              :model-value="dietaryRestrictions.includes(tag)"
              @update:model-value="toggleDietaryRestriction(tag)"
            />
          </div>
        </fieldset>
        <fieldset class="tag-group">
          <legend class="tag-group__legend">Diet</legend>
          <div class="tag-group__chips">
            <ToggleChip
              v-for="tag in DIET_TAGS"
              :key="tag"
              :label="tag"
              :model-value="dietaryRestrictions.includes(tag)"
              @update:model-value="toggleDietaryRestriction(tag)"
            />
          </div>
        </fieldset>
      </div>

      <label class="field-label">
        Allergies
        <TagInput
          v-model="allergies"
          data-testid="pref-allergies"
          placeholder="Type an allergy and press Enter"
        />
      </label>

      <div class="field-label" data-testid="pref-favorite_cuisines">
        Favorite cuisines
        <fieldset class="tag-group">
          <legend class="sr-only">Cuisine</legend>
          <div class="tag-group__chips">
            <ToggleChip
              v-for="tag in CUISINE_TAGS"
              :key="tag"
              :label="tag"
              :model-value="favoriteCuisines.includes(tag)"
              @update:model-value="toggleFavoriteCuisine(tag)"
            />
          </div>
        </fieldset>
      </div>

      <label class="field-label">
        Disliked ingredients
        <TagInput
          v-model="dislikedIngredients"
          data-testid="pref-disliked_ingredients"
          placeholder="Type an ingredient and press Enter"
        />
      </label>
    </section>

    <div class="actions">
      <p v-if="error" class="error-msg">{{ error }}</p>
      <p v-if="saved" class="success-msg">Saved!</p>
      <button :disabled="saving" class="save-btn" data-testid="save-btn" @click="save">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}
h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 1.5rem; }
.settings-section { margin-bottom: 2rem; }
h2 { font-size: 1rem; font-weight: 600; margin: 0 0 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
.field-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}
.field-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}
.field-textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  resize: vertical;
}
.chip-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
.meal-type-chip {
  padding: 0.25rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 1rem;
  background: white;
  font-size: 0.8125rem;
  cursor: pointer;
}
.meal-type-chip.active { background: #2563eb; color: white; border-color: #2563eb; }
.slider-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.25rem; }
.slider { flex: 1; }
.slider-value { font-size: 0.875rem; color: #6b7280; min-width: 4rem; }
.actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; }
.save-btn {
  padding: 0.625rem 2rem;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}
.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.error-msg { color: #dc2626; font-size: 0.875rem; }
.success-msg { color: #16a34a; font-size: 0.875rem; }
.section-hint { font-size: 0.8125rem; color: #6b7280; margin: -0.5rem 0 1rem; }

/* Food preferences: pre-built chip groups (dietary_restrictions, favorite_cuisines) */
.tag-group {
  border: none;
  padding: 0;
  margin: 0 0 var(--space-2);
}
.tag-group:last-child { margin-bottom: 0; }
.tag-group__legend {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: var(--space-1);
  padding: 0;
}
.tag-group__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* Visually-hidden utility for the Cuisine <legend> (heading above already
   says "Favorite cuisines" — the legend is redundant visually but needed
   for fieldset/legend semantics + screen readers). Matches BaseInput.vue's
   .sr-only convention. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
