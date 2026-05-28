import { Redirect } from 'expo-router';

export default function TasksRedirect() {
  return <Redirect href={{ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any} />;
}
