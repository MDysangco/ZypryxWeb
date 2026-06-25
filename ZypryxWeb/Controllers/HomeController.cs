using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using System.Diagnostics;
using TrenchLooter;
using Zyprix.Models;
using ZypryxWeb.Models;
using ZypryxWeb.Models.ParameterModels;
using ZypryxWeb.Models.ViewModels;

namespace ZypryxWeb.Controllers
{
    public class HomeController : Controller
    {
        public readonly IConfiguration _config;
        public readonly IMemoryCache _memoryCache;

		public HomeController(IConfiguration config, IMemoryCache memoryCache)
		{
			_config = config;
			_memoryCache = memoryCache;
		}

		public async Task<IActionResult> Index()
        {
			if (!_memoryCache.TryGetValue("homePageModelView", out HomePageModelView? model))
			{
				model = new HomePageModelView();

				string token = Utils.JwtFactory.CreateInternalServiceToken(_config, "tasker", 60);
				ZypryxClient zypryxClient = new ZypryxClient(token);

				List<Coin> coins = await zypryxClient.GetAllCoins() ?? new List<Coin>();
				List<Kline> klines = new List<Kline>();

				foreach (Coin coin in coins)
				{
					List<Kline>? coinKlines = await zypryxClient.GetKlines(coin.Id, KlineInterval.OneHour, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds());
					if (coinKlines != null)
					{
						klines.AddRange(coinKlines);
					}
				}

				model.Coins = coins;
				model.Klines = klines;

				_memoryCache.Set("homePageModelView", model, TimeSpan.FromMinutes(30));
			}

			return View(model);
        }

		[Route("dashboard")]
		public async Task<IActionResult> Dashboard()
		{
			if (!_memoryCache.TryGetValue("homePageModelView", out HomePageModelView? model))
			{
				model = new HomePageModelView();

				string token = Utils.JwtFactory.CreateInternalServiceToken(_config, "tasker", 60);
				ZypryxClient zypryxClient = new ZypryxClient(token);

				List<Coin>? coins = await zypryxClient.GetAllCoins();
				List<Kline> klines = new List<Kline>();

				foreach (Coin coin in coins)
				{
					List<Kline>? coinKlines = await zypryxClient.GetKlines(coin.Id, KlineInterval.OneHour);
					if (coinKlines != null)
					{
						klines.AddRange(coinKlines);
					}
				}

				model.Coins = coins;
				model.Klines = klines;

				_memoryCache.Set("homePageModelView", model, TimeSpan.FromMinutes(30));
			}

			return View(model);

		}

		[HttpPost]
		public async Task<List<KlineDto>> GetCoinData([FromBody] KlineRequest request)
		{
			// Fetch klines
			List<Kline>? klines = await GetKlines(request);
			if (klines == null || !klines.Any()) return new List<KlineDto>();

			// Fetch readings (may be null)
			List<Reading>? readings = await GetReadings(request) ?? new List<Reading>();

			// Normalization helper
			DateTime Normalize(DateTime dt) =>
				new DateTime(dt.Year, dt.Month, dt.Day, dt.Hour, 0, 0, DateTimeKind.Utc);

			// Build lookup with normalized keys
			Dictionary<DateTime, Reading> readingLookup =
				readings?.ToDictionary(r => Normalize(r.TimeStampUTC))
				?? new Dictionary<DateTime, Reading>();

			// Merge klines + readings
			var result = klines.Select(k =>
			{
				// Convert kline timestamp → DateTime → normalize
				DateTime kTime = Normalize(
					DateTimeOffset.FromUnixTimeMilliseconds(k.KlineOpenTime.Value).UtcDateTime
				);

				readingLookup.TryGetValue(kTime, out var r);

				return new KlineDto
				{
					Open = k.OpenPrice ?? 0m,
					High = k.HighPrice ?? 0m,
					Low = k.LowPrice ?? 0m,
					Close = k.ClosePrice ?? 0m,
					Volume = k.Volume ?? 0m,
					Time = k.KlineOpenTime.Value,
					Signal = r?.FinalSignal,
					ProbSell = r?.ProbSell ?? 0.0,
					ProbHold = r?.ProbHold ?? 0.0,
					ProbBuy = r?.ProbBuy ?? 0.0
				};

			}).ToList();

			var firstSignal = result.FirstOrDefault(r => !string.IsNullOrEmpty(r.Signal))?.Signal;

			return result;
		}


		[HttpPost]
		public async Task<List<Kline>?> GetKlines([FromBody] KlineRequest request)
		{
			if (!_memoryCache.TryGetValue($"klines_{request.CoinId}", out List<Kline>? klines))
			{
				string token = Utils.JwtFactory.CreateInternalServiceToken(_config, "tasker", 60);
				ZypryxClient zypryxClient = new ZypryxClient(token);

				klines = await zypryxClient.GetKlines(request.CoinId, KlineInterval.OneHour, null, null);
				if (klines == null || !klines.Any())
				{
					return null;
				}

				klines = klines.OrderBy(k => k.KlineOpenTime).ToList();

				_memoryCache.Set($"klines_{request.CoinId}", klines, TimeSpan.FromMinutes(50));
			}

			return klines;
		}

		[HttpPost]
		public async Task<List<Reading>?> GetReadings([FromBody] KlineRequest request)
		{
			if(!_memoryCache.TryGetValue($"readings_{request.CoinId}", out List<Reading>? readings))
			{
				string token = Utils.JwtFactory.CreateInternalServiceToken(_config, "tasker", 60);
				ZypryxClient zypryxClient = new ZypryxClient(token);

				readings = await zypryxClient.GetReadings(request.CoinId);
				if (readings == null || !readings.Any())
				{
					return null;
				}

				readings = readings.OrderBy(k => k.TimeStampUTC).ToList();

				_memoryCache.Set($"readings_{request.CoinId}", readings, TimeSpan.FromMinutes(50));
			}

			return readings;	
		}


		[ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
