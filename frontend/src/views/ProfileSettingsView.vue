<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useUserStore } from '@/stores/useUserStore'
import { useToast } from '@/composables/useToast'
import ToggleChip from '@/components/base/ToggleChip.vue'
import TagInput from '@/components/base/TagInput.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseButton from '@/components/base/BaseButton.vue'

const userStore = useUserStore()
const toast = useToast()

const displayName = ref('')
const preferredUnits = ref<'metric' | 'imperial'>('metric')
const defaultServings = ref(2)
const defaultServingsInput = ref('2')
const mealPlanSystemPrompt = ref('')
const mealPlanMealTypes = ref<string[]>(['dinner'])
const mealPlanDaysAhead = ref(7)

// BaseInput's modelValue is typed as string (matches the pattern already
// used for numeric fields in ShoppingListView.vue), so we bridge it to the
// numeric ref that the rest of this component (and the save payload) uses.
watch(defaultServingsInput, (v) => {
  const parsed = Number(v)
  if (!Number.isNaN(parsed)) defaultServings.value = parsed
})

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
  defaultServingsInput.value = String(u.default_servings)
  mealPlanSystemPrompt.value = u.meal_plan_system_prompt ?? ''
  mealPlanMealTypes.value = u.meal_plan_meal_types ?? ['dinner']
  mealPlanDaysAhead.value = u.meal_plan_days_ahead ?? 7
})

async function save() {
  saving.value = true
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
    toast.show({ message: 'Saved' })
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
      <BaseInput
        v-model="displayName"
        label="Display name"
        type="text"
        placeholder="Your name"
      />
      <label class="field-label">
        Preferred units
        <select v-model="preferredUnits" class="field-input">
          <option value="metric">Metric</option>
          <option value="imperial">Imperial</option>
        </select>
      </label>
      <BaseInput
        v-model="defaultServingsInput"
        label="Default servings"
        type="number"
        min="1"
        max="20"
      />
    </section>

    <section class="settings-section">
      <h2>Meal Planning</h2>

      <div class="field-label">
        Meal types to show
        <div class="chip-row">
          <ToggleChip
            v-for="mt in ALL_MEAL_TYPES"
            :key="mt"
            :label="mt"
            :model-value="mealPlanMealTypes.includes(mt)"
            @update:model-value="toggleMealType(mt)"
          />
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

      <BaseTextarea
        v-model="mealPlanSystemPrompt"
        label="Family context &amp; AI instructions"
        :rows="4"
        placeholder="e.g. 2 adults, 1 toddler. We prefer low-spice meals on weekdays."
      />
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
      <p v-if="error" class="error-msg" role="alert">{{ error }}</p>
      <BaseButton
        variant="primary"
        :loading="saving"
        data-testid="save-btn"
        @click="save"
      >
        Save settings
      </BaseButton>
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--space-4);
  /* Reserve room so content isn't hidden behind the sticky save bar. */
  padding-bottom: calc(var(--space-8) + var(--space-4));
}
h1 { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 600; margin: 0 0 var(--space-5); }
.settings-section { margin-bottom: var(--space-6); }
h2 {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--space-2);
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}
/* Profile section BaseInput/BaseTextarea instances also need the same
   bottom rhythm as the native .field-label fields around them. */
.settings-section > :deep(.input-wrapper),
.settings-section > :deep(.textarea-wrapper) {
  margin-bottom: var(--space-4);
}
.field-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
}
.chip-row { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); }
.slider-row { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-1); }
.slider { flex: 1; }
.slider-value { font-size: var(--text-sm); color: var(--color-text-muted); min-width: 4rem; }
.actions {
  /* Sticky bottom save bar: stays reachable while scrolling a long form.
     Matches the sticky-bar pattern used elsewhere in this codebase (e.g.
     RecipeForm.vue's .recipe-form__actions, ShoppingListNewView.vue's
     .footer), mirrored to the bottom edge. */
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  margin: 0 calc(var(--space-4) * -1) calc(var(--space-4) * -1);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.error-msg { color: var(--color-danger); font-size: var(--text-sm); }
.section-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: calc(var(--space-2) * -1) 0 var(--space-4); }

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
