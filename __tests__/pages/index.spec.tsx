import React from 'react';
import { mount, shallow } from 'enzyme';

import withMockRouter from '../../__mocks__/utils.mock';
import Index from '../../pages/index';
import Layout from '../../components/Layout';

describe('Check Index structure', () => {
  let wrapper;

  // eslint-disable-next-line
  beforeEach(() => (wrapper = shallow(<Index />)));

  it('should render a <Layout />', () => {
    // expect(wrapper.find('div').length).toEqual(1);
    // expect(wrapper.find('Layout')).toHaveLength(1);
    expect(wrapper.containsMatchingElement(<Layout>Welcome to WHATABYTE!</Layout>)).toEqual(true);
  });
});

describe('Check Index children', () => {
  let wrapper;
  // eslint-disable-next-line
  beforeEach(() => (wrapper = mount(withMockRouter(<Index />))));
  it('should have Layout component', () => {
    expect(wrapper.find('Layout')).toHaveLength(1);
  });
});