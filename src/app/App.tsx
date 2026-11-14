import { WalkApp } from './WalkApp';
import { defaultDeps, type AppDeps } from './deps';

export type AppProps = {
  deps?: AppDeps;
};

export default function App({ deps = defaultDeps }: AppProps) {
  return <WalkApp deps={deps} />;
}