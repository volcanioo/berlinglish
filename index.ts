import cheerio from 'cheerio';
import axios from 'axios';
import Twitter from 'twitter';
const client = new Twitter({
  consumer_key: process.env.TWITTER_API_KEY,
  consumer_secret: process.env.TWITTER_API_SECRET_KEY,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});
const placeId = '3078869807f9dd36'; // Berlin's place ID

const BASE_URL = 'https://www.berlin.de';
const NEWS_PATH = '/en/news/';

async function fetchArticles(): Promise<Array<any>> {
  const response = await axios(`${BASE_URL}${NEWS_PATH}`);
  const $ = cheerio.load(response.data);
  // .special might include some "random" articles
  const articles: Array<any> = $('#hnews')
    .parent()
    .find('article')
    .not('.special')
    .map(function (index, el) {
      const heading = $(el).find('.heading');
      return {
        title: heading.text(),
        link: `${BASE_URL}${heading.find('a').attr('href')}`,
      };
    })
    .toArray();

  console.log('Fetched articles: ', articles);

  return articles;
}

async function fetchFirst3Articles() {
  const articles = await fetchArticles();

  console.log('Selected 3 articles: ', articles);

  return articles.slice(0, 3);
}

async function postTweet({ status, media_ids }: any) {
  const response = await client.post('statuses/update', {
    status,
    media_ids,
    place_id: placeId,
  });

  return response;
}

async function postImage(image: any) {
  try {
    const { media_id_string } = await client.post('media/upload', {
      media: image,
    });
    console.log('Received image ID: ', media_id_string);

    return media_id_string;
  } catch (e) {
    console.error(e);
  }
}

async function fetchImage(url: any) {
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });

    console.log('Downloaded image: ', data);
    return data;
  } catch (e) {
    console.error(e);
  }
}

async function fetchImageId(url: any) {
  try {
    const image = await fetchImage(url);
    const id = await postImage(image);
    return id;
  } catch (e) {
    console.error(e);
  }
}

async function fetchImageUrl(url: any) {
  try {
    const response = await axios(url);
    const $ = cheerio.load(response.data);
    const singleImage = $('.page-mainimage').find('img').attr('src');
    const doubleImage = $(
      '.swiper-articleimage li.swiper-slide[data-hash="slide1"]',
    )
      .find('img.swiper-lazy')
      .attr('src');
    const imageUrl = singleImage || doubleImage;

    return `${BASE_URL}${imageUrl}`;
  } catch (e) {
    console.error(e);
  }
}

async function homeTimeline(): Promise<Array<any>> {
  const response = await client.get('statuses/user_timeline', {});
  const responseTitles: Array<any> = response.map(
    (tweet: any) => tweet.text.split('\n')[0],
  );

  console.log('Last tweets titles: ', responseTitles);

  return responseTitles;
}

exports.handler = async function handler() {
  const [articles, tweets]: [Array<any>, Array<any>] = await Promise.all([
    fetchFirst3Articles(),
    homeTimeline(),
  ]);
  const newArticles = articles.filter(
    (article: any) => !tweets.includes(article.title),
  );

  const articlesWithImage = await Promise.all(
    newArticles.map(async (article) => {
      article.imageUrl = await fetchImageUrl(article.link);
      return article;
    }),
  );

  console.log('New articles: ', articlesWithImage);

  for (const article of articlesWithImage) {
    const status = [article.title, `Read more: ${article.link}`].join('\n');
    const media_ids = await fetchImageId(article.imageUrl);
    const response = await postTweet({ status, media_ids });

    console.log('Tweet response: ', response);
  }
};
