import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TasksRedirect() {
  const { initialTab, tab } = useLocalSearchParams<{ initialTab?: string; tab?: string }>();
  const dest = initialTab ?? tab ?? 'tasks';
  return <Redirect href={{ pathname: '/(director)/staffhub', params: { tab: dest } } as any} />;
}
