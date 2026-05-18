import { StatusBar } from 'react-native';
import Navigation from './src/navigation/index';

export default function App() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f17" />
      <Navigation />
    </>
  );
}
