import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VaultRecipeEditRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={id ? `/(director)/vault/recipe-edit?id=${id}` : '/(director)/vault/recipe-edit'} />;
}
