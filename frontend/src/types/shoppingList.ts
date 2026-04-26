// frontend/src/types/shoppingList.ts

export interface ShoppingListSummary {
  id: string
  name: string
  from_date: string | null
  to_date: string | null
  created_at: string
}

export interface ShoppingListItem {
  id: string
  shopping_list_id: string
  ingredient_name: string
  total_quantity: number
  unit: string
  detail: string
  category: string
  recipe_ids: string[]
  checked: boolean
  created_at: string
}

export interface ShoppingList {
  id: string
  user_id: string
  meal_plan_id: string
  name: string
  items: ShoppingListItem[]
  created_at: string
  updated_at: string
}
