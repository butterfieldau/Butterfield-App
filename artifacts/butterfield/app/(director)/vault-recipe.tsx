import { Redirect, useLocalSearchParams } from 'expo-router';

export default function VaultRecipeRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <Redirect href={id ? `/(director)/vault/recipe?id=${id}` : '/(director)/vault'} />;
}
