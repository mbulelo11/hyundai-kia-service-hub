import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type JokeResponse = {
  error?: boolean;
  category?: string;
  type?: 'single' | 'twopart';
  joke?: string;
  setup?: string;
  delivery?: string;
};

export default function App() {
  const [joke, setJoke] = useState<JokeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchJoke = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        'https://v2.jokeapi.dev/joke/Any?type=single&blacklistFlags=nsfw,religious,political,racist,sexist,explicit'
      );

      if (!response.ok) {
        throw new Error('Failed to load joke');
      }

      const data: JokeResponse = await response.json();

      if (data.error || (!data.joke && (!data.setup || !data.delivery))) {
        throw new Error('Invalid joke response');
      }

      setJoke(data);
    } catch (_error) {
      setJoke({
        category: 'Fallback',
        type: 'single',
        joke: 'Why did the developer go broke? Because they used all their cache and forgot to save the joke.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJoke();
  }, []);

  const displayText = joke?.joke || `${joke?.setup ?? ''}\n\n${joke?.delivery ?? ''}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Random Joke Generator</Text>
        <Text style={styles.subtitle}>Powered by JokeAPI</Text>

        <View style={styles.card}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#5B8DEF" />
              <Text style={styles.loadingText}>Loading a joke...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.jokeContent}>
              {joke?.category ? (
                <Text style={styles.category}>Category: {joke.category}</Text>
              ) : null}
              <Text style={styles.jokeText}>{displayText}</Text>
            </ScrollView>
          )}
        </View>

        <TouchableOpacity style={styles.button} onPress={fetchJoke} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Tell me another'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#cbd5e1',
    marginBottom: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    minHeight: 260,
    backgroundColor: '#111827',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 180,
  },
  loadingText: {
    marginTop: 12,
    color: '#cbd5e1',
    fontSize: 16,
  },
  jokeContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  category: {
    color: '#7dd3fc',
    fontWeight: '700',
    marginBottom: 12,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  jokeText: {
    color: '#f8fafc',
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '600',
  },
  button: {
    marginTop: 28,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#5B8DEF',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
