using Microsoft.Extensions.Configuration;
using System.Text.Json;
using Zyprix.Models;
using Utils;

namespace TrenchLooter
{
    public class ZypryxClient
    {
        private readonly string apiURL;
        private readonly string _token;

        public ZypryxClient(string token)
        {
            IConfiguration config = new ConfigurationBuilder().AddJsonFile("appsettings.json").Build();

            apiURL = config["ZyprixAPIUrl"] ?? "";
            _token = token;
        }

        //private static readonly JsonSerializerOptions jsonOptions = new()
        //{
        //    PropertyNameCaseInsensitive = true
        //};

        #region Coin Endpoints

        public async Task<List<Coin>?> GetAllCoins()
        {
            try
            {
                string requestURL = $"{apiURL}/coin";
                return await HttpHelper.MakeRequest<List<Coin>>(HttpMethod.Get, requestURL, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return new List<Coin>();
            }
        }

        public async Task<List<Coin>?> GetActiveCoins()
        {
            try
            {
                string requestURL = $"{apiURL}/coin/active";
                return await HttpHelper.MakeRequest<List<Coin>>(HttpMethod.Get, requestURL, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return new List<Coin>();
            }
        }

        public async Task<Coin?> GetCoin(int coinId)
        {
            try
            {
                string requestURL = $"{apiURL}/coin/{coinId}";
                return await HttpHelper.MakeRequest<Coin>(HttpMethod.Get, requestURL, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return new Coin();
            }
        }

        public async Task<bool> UpdateCoin(Coin coin)
        {
            try
            {
                string requestURL = $"{apiURL}/coin/update";
                string jsonContent = JsonSerializer.Serialize(coin);
                return await HttpHelper.MakePost<bool>(requestURL, jsonContent, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return false;
            }
        }

        #endregion

        #region Kline Endpoints
       
        public async Task<List<Kline>?> GetKlines(int coinId, KlineInterval interval, long? startDate = null, long? endDate = null)
		{
			try
			{
				string requestURL = $"{apiURL}/kline?coinId={coinId}&interval={(int)interval}";
                if(startDate != null && endDate != null)
                {
                    requestURL += $"&startDate={startDate}&endDate={endDate}";
				}
				return await HttpHelper.MakeRequest<List<Kline>>(HttpMethod.Get, requestURL, _token);
			}
			catch (Exception ex)
			{
				Console.WriteLine(ex.Message);
				return new List<Kline>();
			}
		}

        public async Task<Kline?> GetLatestKline(int coinId, KlineInterval interval)
        {
            try
            {
                string requestURL = $"{apiURL}/kline/latest?coinId={coinId}&interval={(int)interval}";
                return await HttpHelper.MakeRequest<Kline>(HttpMethod.Get, requestURL, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return new Kline();
            }
        }

        public async Task<Kline?> GetEarliestKline(int coinId, KlineInterval interval)
        {
            try
            {
                string requestURL = $"{apiURL}/kline/earliest?coinId={coinId}&interval={(int)interval}";
                return await HttpHelper.MakeRequest<Kline>(HttpMethod.Get, requestURL, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return new Kline();
            }
        }

        public async Task<bool> InsertKlines(List<Kline> klines)
        {
            try
            {
                string requestURL = $"{apiURL}/kline/insert";
                string jsonContent = JsonSerializer.Serialize(klines);
                return await HttpHelper.MakePost<bool>(requestURL, jsonContent, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return false;
            }
        }

        public async Task<int> DeleteKlinesByDateRange(long startDate, long endDate)
        {
            try
            {
                string requestURL = $"{apiURL}/kline?startDate={startDate}&endDate={endDate}";
                return await HttpHelper.MakeRequest<int>(HttpMethod.Delete, requestURL, _token);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return 0;
            }
        }

		#endregion

		#region Reading Endpoints
        public async Task<List<Reading>?> GetReadings(int coinId)
		{
			try
			{
				string requestURL = $"{apiURL}/reading?coinId={coinId}";
				return await HttpHelper.MakeRequest<List<Reading>>(HttpMethod.Get, requestURL, _token);
			}
			catch (Exception ex)
			{
				Console.WriteLine(ex.Message);
				return new List<Reading>();
			}
		}

		#endregion

	}
}
