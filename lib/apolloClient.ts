import { useMemo } from 'react';
import { ApolloClient, ApolloLink, HttpLink, split, InMemoryCache, NormalizedCacheObject } from '@apollo/client';
import { WebSocketLink } from '@apollo/link-ws';
import { getMainDefinition } from 'apollo-utilities';
import { OperationDefinitionNode } from 'graphql';
import Cookies from 'js-cookie';
import * as ws from 'ws';
import config from '@clientconfig/index';

let apolloClient: ApolloClient<NormalizedCacheObject> | null = null;

const getApolloLinkSource = (): ApolloLink => {
  const httpLink = new HttpLink({ uri: config.API_URL, credentials: 'same-origin' });
  const wsLink = new WebSocketLink({
    uri: <string>config.SOCKET_URL,
    options: {
      reconnect: true,
      lazy: true,
    },
    webSocketImpl: ws,
  });
  const terminatingLink = process.browser
    ? split(
        ({ query }) => {
          const { kind, operation } = getMainDefinition(query) as OperationDefinitionNode;
          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        wsLink,
        httpLink
      )
    : httpLink;

  const authLink = new ApolloLink((operation, forward) => {
    // Retrieve the authorization token
    const token = Cookies.get(<string>config.TOKEN_HANDLE);

    // Use the setContext method to set the HTTP headers.
    operation.setContext({
      headers: {
        'content-type': 'application/json',
        authorization: token ? `Bearer ${token}` : '',
      },
    });

    // Call the next link in the middleware chain.
    if (forward) {
      return forward(operation);
    }
    return null;
  });
  const link = ApolloLink.from([terminatingLink]);
  return authLink.concat(link);
};

export const createApolloClient = (initialState: NormalizedCacheObject): ApolloClient<NormalizedCacheObject> => {
  const clientOptions = () => {
    return {
      ssrMode: typeof window === 'undefined',
      link: getApolloLinkSource(),
      cache: new InMemoryCache().restore(initialState),
    };
  };

  return new ApolloClient(clientOptions());
};

export function initializeApollo(initialState: NormalizedCacheObject) {
  const _apolloClient: ApolloClient<NormalizedCacheObject> = apolloClient ?? createApolloClient(initialState);

  // If your page has Next.js data fetching methods that use Apollo Client, the initial state
  // gets hydrated here
  if (initialState) {
    // Get existing cache, loaded during client side data fetching
    const existingCache = _apolloClient.extract();
    // Restore the cache using the data passed from getStaticProps/getServerSideProps
    // combined with the existing cached data
    _apolloClient.cache.restore({ ...existingCache, ...initialState });
  }
  // For SSG and SSR always create a new Apollo Client
  if (typeof window === 'undefined') return _apolloClient;
  // Create the Apollo Client once in the client
  if (!apolloClient) apolloClient = _apolloClient;

  return _apolloClient;
}

export function useApollo(initialState: NormalizedCacheObject) {
  const store = useMemo(() => initializeApollo(initialState), [initialState]);
  return store;
}
