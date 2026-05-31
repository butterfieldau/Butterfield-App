import { Redirect } from 'expo-router';
export default function MoreCategoryRedirect() {
  return <Redirect href={'/(director)/more' as any} />;
}
